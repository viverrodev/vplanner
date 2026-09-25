-- ============================================================================
-- 0030: choose which shorts stay when a day gets fewer slots
--
-- set_day_limit_keeping(team, day, limit, keep[]) — master only:
--   * the chosen shorts stay on that day (they take its first slots)
--   * dropped Auto shorts move to the next free slot (the queue does it)
--   * dropped FIXED shorts stay fixed (same kind) on the next day with room
--   * posted / partly posted shorts can't be dropped
-- Then the day exception is saved and everything re-dates + renumbers.
-- Staging first, then production.
-- ============================================================================

create or replace function set_day_limit_keeping(p_team uuid, p_day date, p_limit int, p_keep uuid[])
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_keep uuid[] := coalesce(p_keep, '{}');
  v_per_day int;
  v_weekends boolean;
  v_today date;
  r record;
  v_next date;
  v_guard int;
begin
  if not is_team_master(p_team) then
    raise exception 'Only the master can change how many shorts a day takes.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 0 or p_limit > 10 then
    raise exception 'A day can take 0–10 shorts.' using errcode = '23514';
  end if;
  if cardinality(v_keep) > p_limit then
    raise exception 'Pick at most % short%.', p_limit, case when p_limit = 1 then '' else 's' end using errcode = '23514';
  end if;

  select t.shorts_per_day, t.shorts_weekends, (now() at time zone t.timezone)::date
    into v_per_day, v_weekends, v_today
    from teams t where t.id = p_team
    for update;
  if not found then
    raise exception 'Team not found.' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from unnest(v_keep) k(id)
     where not exists (select 1 from short_videos s where s.id = k.id and s.team_id = p_team and s.planned_date = p_day)
  ) then
    raise exception 'Those shorts aren''t on that day anymore. Refresh and try again.' using errcode = '23514';
  end if;

  if exists (
    select 1 from short_videos s
     where s.team_id = p_team and s.planned_date = p_day
       and short_is_locked(s) and not (s.id = any(v_keep))
  ) then
    raise exception 'Posted shorts stay on their day. Keep them selected.' using errcode = '23514';
  end if;

  perform set_config('vp.short_system', 'on', true);

  -- Kept shorts take the day's first slots: reuse the day's own queue
  -- positions, handing the earliest ones to the kept shorts.
  with day_items as (
    select id, queue_position, (id = any(v_keep)) as keep
      from short_videos where team_id = p_team and planned_date = p_day
  ),
  slots as (
    select queue_position, row_number() over (order by queue_position) as rn from day_items
  ),
  ordered as (
    select id, row_number() over (order by (not keep), queue_position) as rn from day_items
  )
  update short_videos s
     set queue_position = sl.queue_position
    from ordered o join slots sl on sl.rn = o.rn
   where s.id = o.id;

  -- Dropped FIXED shorts: stay fixed, on the next day that has room for
  -- another fixed short (Auto shorts flow around them afterwards).
  for r in
    select id, pin_kind from short_videos
     where team_id = p_team and planned_date = p_day
       and schedule_mode = 'pinned' and not (id = any(v_keep))
     order by queue_position
  loop
    v_next := greatest(p_day, v_today) + 1;
    v_guard := 0;
    loop
      exit when (
        select count(*) from short_videos s
         where s.team_id = p_team and s.planned_date = v_next and not short_in_queue(s, v_today)
      ) < short_day_capacity(p_team, v_next, v_per_day, v_weekends);
      v_next := v_next + 1;
      v_guard := v_guard + 1;
      if v_guard > 3660 then
        raise exception 'No free day found for a fixed short.' using errcode = '23514';
      end if;
    end loop;
    update short_videos
       set planned_date = v_next,
           queue_position = short_position_for_date(p_team, v_next, id)
     where id = r.id;
  end loop;

  perform set_config('vp.short_system', 'off', true);

  -- Save the exception (its trigger re-plans), then re-plan explicitly in
  -- case the limit itself didn't change.
  insert into team_day_limits (team_id, day, max_shorts, updated_by, updated_at)
  values (p_team, p_day, p_limit, auth.uid(), now())
  on conflict (team_id, day) do update
    set max_shorts = excluded.max_shorts, updated_by = excluded.updated_by, updated_at = now();

  perform recalc_short_queue(p_team);
end;
$$;

revoke all on function set_day_limit_keeping(uuid, date, int, uuid[]) from public, anon;
grant execute on function set_day_limit_keeping(uuid, date, int, uuid[]) to authenticated;


-- ============================================================================
-- ONE QUEUE START AT A TIME
--
-- Only one short per team can "Start queue from here" while it's active
-- (upcoming and not posted). Setting a second one fails with a clear
-- message: release the current one first (set it to "Just this one" or
-- Auto). Once its date has passed, or it's posted, a new one can be set.
-- ============================================================================

create or replace function active_queue_start(p_team uuid, p_exclude uuid default null)
returns short_videos
language sql
stable
security definer set search_path = public
as $$
  select s.* from short_videos s
   where s.team_id = p_team
     and s.id is distinct from p_exclude
     and s.schedule_mode = 'pinned' and s.pin_kind = 'anchor'
     and s.planned_date >= team_today(p_team)
     and not short_is_locked(s)
   order by s.planned_date, s.queue_position
   limit 1;
$$;
revoke all on function active_queue_start(uuid, uuid) from public, anon, authenticated;

create or replace function short_one_queue_start()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  other short_videos;
begin
  if current_setting('vp.short_system', true) = 'on' then
    return new;
  end if;
  if new.schedule_mode = 'pinned' and new.pin_kind = 'anchor'
     and (tg_op = 'INSERT'
          or old.schedule_mode is distinct from 'pinned'
          or old.pin_kind is distinct from 'anchor'
          or new.planned_date is distinct from old.planned_date) then
    other := active_queue_start(new.team_id, new.id);
    if other.id is not null then
      raise exception 'Short #% already starts the queue. Release it first: set it to "Just this one" or Auto.', other.entry_number
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- Runs after the other BEFORE triggers have settled mode and kind
-- (Postgres runs same-timing triggers alphabetically; "zz_" = last).
drop trigger if exists zz_short_one_queue_start on short_videos;
create trigger zz_short_one_queue_start
  before insert or update on short_videos
  for each row execute procedure short_one_queue_start();

-- Existing data: if a team has several active queue starts, keep the
-- earliest and make the others "Just this one".
do $$
declare
  t uuid;
  keep uuid;
begin
  for t in select distinct team_id from short_videos loop
    keep := (active_queue_start(t)).id;
    if keep is not null then
      perform set_config('vp.short_system', 'on', true);
      update short_videos s set pin_kind = 'oneoff'
       where s.team_id = t and s.id <> keep
         and s.schedule_mode = 'pinned' and s.pin_kind = 'anchor'
         and s.planned_date >= team_today(t) and not short_is_locked(s);
      perform set_config('vp.short_system', 'off', true);
      perform recalc_short_queue(t);
    end if;
  end loop;
end $$;

-- For the app: which short currently starts the queue (or none).
create or replace function current_queue_start(p_team uuid)
returns table (id uuid, entry_number int, planned_date date)
language plpgsql
stable
security definer set search_path = public
as $$
declare
  s short_videos;
begin
  if not (p_team in (select my_team_ids())) then
    return;
  end if;
  s := active_queue_start(p_team);
  if s.id is not null then
    id := s.id;
    entry_number := s.entry_number;
    planned_date := s.planned_date;
    return next;
  end if;
end;
$$;
revoke all on function current_queue_start(uuid) from public, anon;
grant execute on function current_queue_start(uuid) to authenticated;

-- New fixed shorts default to "Just this one" when a queue start exists.
create or replace function short_before_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.entry_number := next_team_number(new.team_id, 'short_video');
  new.title := btrim(new.title);
  if new.planned_date is null then
    new.schedule_mode := 'auto';
    new.pin_kind := null;
    new.queue_position := next_team_number(new.team_id, 'short_queue');
  else
    new.schedule_mode := 'pinned';
    new.pin_kind := coalesce(
      new.pin_kind,
      case when (active_queue_start(new.team_id)).id is null then 'anchor' else 'oneoff' end
    );
    new.queue_position := short_position_for_date(new.team_id, new.planned_date, null);
  end if;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

-- Safety net: if system moves ever leave two active queue starts (e.g. an
-- old one moved into the future), keep the earliest; the rest become
-- "Just this one". Runs at the start of every re-plan.
create or replace function recalc_short_queue(p_team uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  keep uuid;
begin
  perform 1 from teams where id = p_team for update;
  if not found then
    return;
  end if;
  perform set_config('vp.short_system', 'on', true);

  keep := (active_queue_start(p_team)).id;
  if keep is not null then
    update short_videos s set pin_kind = 'oneoff'
     where s.team_id = p_team and s.id <> keep
       and s.schedule_mode = 'pinned' and s.pin_kind = 'anchor'
       and s.planned_date >= team_today(p_team) and not short_is_locked(s);
  end if;

  update short_videos s
     set planned_date = p.slot_date
    from short_queue_plan(p_team, false) p
   where s.id = p.short_id
     and s.planned_date is distinct from p.slot_date;
  update teams set shorts_queue_day = (now() at time zone timezone)::date where id = p_team;
  perform set_config('vp.short_system', 'off', true);
  perform renumber_shorts(p_team);
end;
$$;
