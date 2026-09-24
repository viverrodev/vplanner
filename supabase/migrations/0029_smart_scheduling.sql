-- ============================================================================
-- 0029: smarter scheduling
--
--   * FIXED DATES come in two kinds (short_videos.pin_kind):
--       'anchor' — "Start queue from here": Auto shorts after it in the
--                  list continue from its date (default).
--       'oneoff' — "Just this one": holds its own slot; the queue carries
--                  on as if it weren't there and later fills next to it.
--   * DAY EXCEPTIONS (team_day_limits): any day can take a different
--     number of shorts (0 = none) than the team default — set it whenever
--     you find out, and everything after re-dates.
--   * ROLL FORWARD (teams.shorts_roll_forward, on by default): Auto shorts
--     left unposted on a past day move to the next free slot instead of
--     sitting there overdue. Fixed dates stay put (shown as overdue).
--   * MOVE UP / DOWN works for every short that isn't posted: it swaps
--     places with its neighbour in the list; a fixed short swaps DATES.
--
-- Staging first, then production.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. SCHEMA
-- ---------------------------------------------------------------------------

alter table short_videos
  add column if not exists pin_kind text check (pin_kind in ('anchor', 'oneoff'));
update short_videos set pin_kind = 'anchor' where schedule_mode = 'pinned' and pin_kind is null;

-- Fractional positions let a newly fixed short slot in between two others.
alter table short_videos alter column queue_position type double precision;

alter table teams
  add column if not exists shorts_roll_forward boolean not null default true,
  add column if not exists shorts_queue_day date;
grant update (shorts_roll_forward) on teams to authenticated;

create table if not exists team_day_limits (
  team_id uuid not null references teams(id) on delete cascade,
  day date not null,
  max_shorts int not null check (max_shorts between 0 and 10),
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (team_id, day)
);
create index if not exists team_day_limits_updated_by_idx on team_day_limits (updated_by);

alter table team_day_limits enable row level security;

drop policy if exists "day limits readable by teammates" on team_day_limits;
create policy "day limits readable by teammates"
  on team_day_limits for select to authenticated
  using (team_id in (select my_team_ids()));
drop policy if exists "masters add day limits" on team_day_limits;
create policy "masters add day limits"
  on team_day_limits for insert to authenticated
  with check (is_team_master(team_id));
drop policy if exists "masters edit day limits" on team_day_limits;
create policy "masters edit day limits"
  on team_day_limits for update to authenticated
  using (is_team_master(team_id)) with check (is_team_master(team_id));
drop policy if exists "masters remove day limits" on team_day_limits;
create policy "masters remove day limits"
  on team_day_limits for delete to authenticated
  using (is_team_master(team_id));

do $$ begin
  alter publication supabase_realtime add table team_day_limits;
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------------
-- 2. WHAT MOVES
-- ---------------------------------------------------------------------------

-- Posted, or posted on at least one platform → never moves.
create or replace function short_is_locked(s short_videos)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select s.stage = 'posted' or exists (select 1 from short_video_posts p where p.short_id = s.id);
$$;

-- An Auto short whose date the queue controls right now.
create or replace function short_in_queue(s short_videos, p_today date)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select s.schedule_mode = 'auto'
     and not short_is_locked(s)
     and (
       s.planned_date is null
       or s.planned_date >= p_today
       or coalesce((select t.shorts_roll_forward from teams t where t.id = s.team_id), true)
     );
$$;

-- How many shorts a day takes: the exception if there is one, otherwise
-- the team default (0 on weekends when weekends are off).
create or replace function short_day_capacity(p_team uuid, p_day date, p_per_day int, p_weekends boolean)
returns int
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select max_shorts from team_day_limits where team_id = p_team and day = p_day),
    case when p_weekends or extract(isodow from p_day) < 6 then p_per_day else 0 end
  );
$$;

revoke all on function short_is_locked(short_videos) from public, anon, authenticated;
revoke all on function short_in_queue(short_videos, date) from public, anon, authenticated;
revoke all on function short_day_capacity(uuid, date, int, boolean) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. THE PLAN
-- ---------------------------------------------------------------------------

create or replace function short_queue_plan(p_team uuid, p_extra boolean default false)
returns table (short_id uuid, slot_date date)
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_per_day int;
  v_weekends boolean;
  v_today date;
  v_day date;
  v_used jsonb := '{}'::jsonb;
  v_guard int;
  r record;
begin
  select t.shorts_per_day, t.shorts_weekends, (now() at time zone t.timezone)::date
    into v_per_day, v_weekends, v_today
    from teams t where t.id = p_team;
  if not found then
    return;
  end if;

  -- Everything whose date is NOT decided by the queue fills its day first
  -- (fixed dates of both kinds, posted shorts).
  for r in
    select s.planned_date as day, count(*) as c
      from short_videos s
     where s.team_id = p_team
       and s.planned_date >= v_today
       and not short_in_queue(s, v_today)
     group by s.planned_date
  loop
    v_used := v_used || jsonb_build_object(r.day::text, r.c);
  end loop;

  -- Walk the list in order. Anchors move the cursor forward to their
  -- date; Auto shorts take the next day with room.
  v_day := v_today;
  for r in
    select s.id, s.planned_date, short_in_queue(s, v_today) as auto
      from short_videos s
     where s.team_id = p_team
       and (short_in_queue(s, v_today) or (s.schedule_mode = 'pinned' and s.pin_kind = 'anchor'))
     order by s.queue_position, s.created_at, s.id
  loop
    if not r.auto then
      if r.planned_date > v_day then
        v_day := r.planned_date;
      end if;
      continue;
    end if;

    v_guard := 0;
    loop
      exit when coalesce((v_used ->> v_day::text)::int, 0)
                < short_day_capacity(p_team, v_day, v_per_day, v_weekends);
      v_day := v_day + 1;
      v_guard := v_guard + 1;
      if v_guard > 3660 then
        raise exception 'No free posting day in the next 10 years — check the day limits.' using errcode = '23514';
      end if;
    end loop;
    v_used := jsonb_set(v_used, array[v_day::text], to_jsonb(coalesce((v_used ->> v_day::text)::int, 0) + 1));
    short_id := r.id;
    slot_date := v_day;
    return next;
  end loop;

  if p_extra then
    v_guard := 0;
    loop
      exit when coalesce((v_used ->> v_day::text)::int, 0)
                < short_day_capacity(p_team, v_day, v_per_day, v_weekends);
      v_day := v_day + 1;
      v_guard := v_guard + 1;
      if v_guard > 3660 then
        raise exception 'No free posting day in the next 10 years — check the day limits.' using errcode = '23514';
      end if;
    end loop;
    short_id := null;
    slot_date := v_day;
    return next;
  end if;
end;
$$;
revoke all on function short_queue_plan(uuid, boolean) from public, anon, authenticated;

-- Re-date + renumber, and remember which day we last did it for.
create or replace function recalc_short_queue(p_team uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform 1 from teams where id = p_team for update;
  if not found then
    return;
  end if;
  perform set_config('vp.short_system', 'on', true);
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

-- Called when a shorts page opens: if the team's day has rolled over
-- since the last recalculation, roll unposted Auto shorts forward.
-- Cheap no-op the rest of the day.
create or replace function refresh_short_queue(p_team uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not (p_team in (select my_team_ids())) then
    return;
  end if;
  if exists (
    select 1 from teams t
     where t.id = p_team
       and (t.shorts_queue_day is null or t.shorts_queue_day < (now() at time zone t.timezone)::date)
  ) then
    perform recalc_short_queue(p_team);
  end if;
end;
$$;
revoke all on function refresh_short_queue(uuid) from public, anon;
grant execute on function refresh_short_queue(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 4. FIXING A DATE: default kind + place it where its date falls
-- ---------------------------------------------------------------------------

-- Position just after everything dated on or before p_day, so "the ones
-- after it" really are the ones dated after it.
create or replace function short_position_for_date(p_team uuid, p_day date, p_exclude uuid)
returns double precision
language sql
stable
security definer set search_path = public
as $$
  with before as (
    select max(queue_position) as p from short_videos
     where team_id = p_team and id is distinct from p_exclude and planned_date <= p_day
  ),
  after as (
    select min(queue_position) as p from short_videos
     where team_id = p_team and id is distinct from p_exclude
       and queue_position > coalesce((select p from before), -1e18)
  )
  select case
    when (select p from before) is null and (select p from after) is null then 1
    when (select p from before) is null then (select p from after) - 1
    when (select p from after) is null then (select p from before) + 1
    else ((select p from before) + (select p from after)) / 2
  end;
$$;
revoke all on function short_position_for_date(uuid, date, uuid) from public, anon, authenticated;

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
    new.pin_kind := coalesce(new.pin_kind, 'anchor');
    new.queue_position := short_position_for_date(new.team_id, new.planned_date, null);
  end if;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create or replace function short_guard_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_system boolean := current_setting('vp.short_system', true) = 'on';
  v_master boolean;
  v_scripter boolean;
  v_scheduler boolean;
  v_editor boolean;
  v_reviewer boolean;
  v_in_script boolean := old.stage = 'script';
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;

  if auth.uid() is null or v_system then
    return new;
  end if;

  if new.team_id is distinct from old.team_id
     or new.entry_number is distinct from old.entry_number
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.queue_position is distinct from old.queue_position then
    raise exception 'That can''t be changed.' using errcode = '42501';
  end if;

  if old.stage = 'posted' and new.stage is distinct from old.stage then
    raise exception 'This short is posted and locked. Un-mark a platform to reopen it.' using errcode = '42501';
  end if;

  -- Date semantics: choosing a date fixes it (default: start the queue
  -- from here); clearing it — or asking for Auto — hands it back.
  if new.planned_date is distinct from old.planned_date then
    new.schedule_mode := case when new.planned_date is null then 'auto' else 'pinned' end;
  end if;
  if new.schedule_mode = 'auto' then
    if old.schedule_mode = 'pinned' then
      new.planned_date := null;
    end if;
    new.pin_kind := null;
  else
    new.pin_kind := coalesce(new.pin_kind, old.pin_kind, 'anchor');
    -- Newly fixed, re-dated, or turned into an anchor → sit where the date falls.
    if old.schedule_mode <> 'pinned'
       or new.planned_date is distinct from old.planned_date
       or new.pin_kind is distinct from old.pin_kind then
      new.queue_position := short_position_for_date(new.team_id, new.planned_date, new.id);
    end if;
  end if;

  v_master := is_team_master(old.team_id);
  if v_master then
    return new;
  end if;

  v_scripter := has_team_role(old.team_id, 'scripter');
  v_scheduler := has_team_role(old.team_id, 'publisher');
  v_editor := exists (
    select 1 from team_members where id = old.editor_member_id and user_id = auth.uid() and status = 'active'
  );
  v_reviewer := exists (
    select 1 from team_members where id = old.reviewer_member_id and user_id = auth.uid() and status = 'active'
  );

  if new.stage is distinct from old.stage and not (
       (v_editor and old.stage = 'editing' and new.stage = 'review')
    or (v_reviewer and old.stage = 'review' and new.stage in ('ready', 'editing'))
  ) then
    raise exception 'You can''t move this short to that stage.' using errcode = '42501';
  end if;

  if new.review_note is distinct from old.review_note
     and not (v_reviewer and old.stage = 'review' and new.stage is distinct from old.stage) then
    raise exception 'Only the reviewer can leave review notes.' using errcode = '42501';
  end if;

  if new.editor_member_id is distinct from old.editor_member_id
     or new.reviewer_member_id is distinct from old.reviewer_member_id
     or new.scheduler_member_id is distinct from old.scheduler_member_id then
    raise exception 'Only the master can change who works on a short.' using errcode = '42501';
  end if;

  if (new.title is distinct from old.title
      or new.planned_date is distinct from old.planned_date
      or new.schedule_mode is distinct from old.schedule_mode
      or new.pin_kind is distinct from old.pin_kind
      or new.platforms is distinct from old.platforms)
     and not (v_scripter and v_in_script) then
    raise exception 'Only the master (or a scripter, while it''s in Script) can change that.' using errcode = '42501';
  end if;

  if new.caption is distinct from old.caption
     and not (v_scheduler or (v_scripter and v_in_script)) then
    raise exception 'Only the master, a scheduler or the scripter can edit the caption.' using errcode = '42501';
  end if;

  if new.file_link is distinct from old.file_link
     and not (v_editor or v_scheduler) then
    raise exception 'Only the master, its editor or a scheduler can set the file link.' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Re-plan on date-kind changes too.
create or replace function short_queue_changed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if current_setting('vp.short_system', true) = 'on' then
    return null;
  end if;
  if tg_op = 'DELETE' then
    perform recalc_short_queue(old.team_id);
  elsif tg_op = 'INSERT' then
    perform recalc_short_queue(new.team_id);
  elsif new.schedule_mode is distinct from old.schedule_mode
     or new.planned_date is distinct from old.planned_date
     or new.pin_kind is distinct from old.pin_kind
     or new.queue_position is distinct from old.queue_position
     or new.stage is distinct from old.stage then
    perform recalc_short_queue(new.team_id);
  end if;
  return null;
end;
$$;

-- Posting / un-posting locks or frees a short → re-plan.
create or replace function short_post_changed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_short uuid := coalesce(new.short_id, old.short_id);
  v_team uuid;
begin
  if tg_op = 'INSERT' then
    insert into short_video_events (short_id, actor_id, kind, platform)
    values (new.short_id, auth.uid(), 'posted', new.platform);
  elsif tg_op = 'DELETE' then
    insert into short_video_events (short_id, actor_id, kind, platform)
    select old.short_id, auth.uid(), 'unposted', old.platform
    where exists (select 1 from short_videos where id = old.short_id);
  end if;
  perform short_recompute_posted(v_short);
  select team_id into v_team from short_videos where id = v_short;
  if v_team is not null then
    perform recalc_short_queue(v_team);
  end if;
  return coalesce(new, old);
end;
$$;

-- Day exceptions and the roll-forward setting re-plan too.
create or replace function day_limits_changed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform recalc_short_queue(coalesce(new.team_id, old.team_id));
  return null;
end;
$$;

drop trigger if exists day_limits_changed on team_day_limits;
create trigger day_limits_changed
  after insert or update or delete on team_day_limits
  for each row execute procedure day_limits_changed();

create or replace function teams_short_settings_changed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.shorts_per_day is distinct from old.shorts_per_day
     or new.shorts_weekends is distinct from old.shorts_weekends
     or new.shorts_roll_forward is distinct from old.shorts_roll_forward
     or new.timezone is distinct from old.timezone then
    perform recalc_short_queue(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists teams_short_settings_changed on teams;
create trigger teams_short_settings_changed
  after update of shorts_per_day, shorts_weekends, shorts_roll_forward, timezone on teams
  for each row execute procedure teams_short_settings_changed();


-- ---------------------------------------------------------------------------
-- 5. MOVE UP / DOWN — any short that isn't posted
-- ---------------------------------------------------------------------------

create or replace function move_short(p_short uuid, p_direction int)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  s short_videos;
  o short_videos;
  v_i int;
  v_n int;
  v_ids uuid[];
  v_s_date date;
  v_o_date date;
begin
  select * into s from short_videos where id = p_short;
  if not found then
    raise exception 'Short not found.' using errcode = 'P0002';
  end if;
  if not is_team_master(s.team_id) then
    raise exception 'Only the master can reorder shorts.' using errcode = '42501';
  end if;
  if short_is_locked(s) then
    raise exception 'Posted shorts keep their place. Un-mark a platform to move it.' using errcode = '23514';
  end if;

  perform 1 from teams where id = s.team_id for update;

  -- The list exactly as the table shows it (same order as the numbers).
  select array_agg(id order by planned_date asc nulls last, queue_position, created_at, id)
    into v_ids
    from short_videos where team_id = s.team_id;
  v_n := array_length(v_ids, 1);
  v_i := array_position(v_ids, s.id);

  -- Nearest neighbour in that direction that isn't posted.
  loop
    v_i := v_i + case when p_direction < 0 then -1 else 1 end;
    if v_i < 1 or v_i > v_n then
      raise exception '%', case when p_direction < 0 then 'It''s already at the top.' else 'It''s already at the bottom.' end
        using errcode = '23514';
    end if;
    select * into o from short_videos where id = v_ids[v_i];
    exit when not short_is_locked(o);
  end loop;

  v_s_date := s.planned_date;
  v_o_date := o.planned_date;

  -- Swap their places in the list…
  v_ids[array_position(v_ids, s.id)] := o.id;
  v_ids[v_i] := s.id;

  perform set_config('vp.short_system', 'on', true);
  update short_videos x
     set queue_position = t.pos
    from unnest(v_ids) with ordinality as t(id, pos)
   where x.id = t.id and x.queue_position is distinct from t.pos::double precision;

  -- …and a fixed short takes the date of the slot it moves into.
  if s.schedule_mode = 'pinned' and v_o_date is not null then
    update short_videos set planned_date = v_o_date where id = s.id;
  end if;
  if o.schedule_mode = 'pinned' and v_s_date is not null then
    update short_videos set planned_date = v_s_date where id = o.id;
  end if;
  perform set_config('vp.short_system', 'off', true);

  perform recalc_short_queue(s.team_id);
end;
$$;
revoke all on function move_short(uuid, int) from public, anon;
grant execute on function move_short(uuid, int) to authenticated;


-- ---------------------------------------------------------------------------
-- 6. APPLY NOW
-- ---------------------------------------------------------------------------

do $$
declare
  t uuid;
begin
  for t in select distinct team_id from short_videos loop
    perform recalc_short_queue(t);
  end loop;
end $$;
