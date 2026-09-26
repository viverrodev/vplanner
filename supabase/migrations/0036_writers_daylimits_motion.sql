-- ============================================================================
-- 0036: writers per short, schedulers set day limits, animation setting
--
--   * DAY LIMITS: masters AND schedulers can change how many shorts a day
--     takes (including choosing which shorts stay).
--   * WRITERS: each short has its own writers (short_scripters). The
--     team's default writer (teams.default_short_scripter_member_id) is
--     added to every new short automatically; masters and schedulers can
--     add or remove extra writers any time. A short's script can be
--     edited by its writers and masters only; other scripters can read.
--   * profiles.animations_enabled: the user's own on/off for animations.
--
-- Staging first, then production.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. DAY LIMITS: masters and schedulers
-- ---------------------------------------------------------------------------

drop policy if exists "masters add day limits" on team_day_limits;
drop policy if exists "masters edit day limits" on team_day_limits;
drop policy if exists "masters remove day limits" on team_day_limits;
drop policy if exists "masters and schedulers add day limits" on team_day_limits;
drop policy if exists "masters and schedulers edit day limits" on team_day_limits;
drop policy if exists "masters and schedulers remove day limits" on team_day_limits;
create policy "masters and schedulers add day limits" on team_day_limits for insert to authenticated
  with check (is_team_master(team_id) or has_team_role(team_id, 'publisher'));
create policy "masters and schedulers edit day limits" on team_day_limits for update to authenticated
  using (is_team_master(team_id) or has_team_role(team_id, 'publisher'))
  with check (is_team_master(team_id) or has_team_role(team_id, 'publisher'));
create policy "masters and schedulers remove day limits" on team_day_limits for delete to authenticated
  using (is_team_master(team_id) or has_team_role(team_id, 'publisher'));

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
  if not (is_team_master(p_team) or has_team_role(p_team, 'publisher')) then
    raise exception 'Only the master or a scheduler can change how many shorts a day takes.' using errcode = '42501';
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


-- ---------------------------------------------------------------------------
-- 2. WRITERS
-- ---------------------------------------------------------------------------

create table if not exists short_scripters (
  short_id uuid not null references short_videos(id) on delete cascade,
  team_member_id uuid not null references team_members(id) on delete cascade,
  added_by uuid references profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (short_id, team_member_id)
);
create index if not exists short_scripters_member_idx on short_scripters (team_member_id);
create index if not exists short_scripters_added_by_idx on short_scripters (added_by);

-- A writer must be an active member of the short's team.
create or replace function short_scripters_check()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from short_videos s
    join team_members tm on tm.team_id = s.team_id
    where s.id = new.short_id and tm.id = new.team_member_id and tm.status = 'active'
  ) then
    raise exception 'Writers must be active members of this team.' using errcode = '23514';
  end if;
  new.added_by := coalesce(auth.uid(), new.added_by);
  new.added_at := now();
  return new;
end;
$$;
drop trigger if exists short_scripters_check on short_scripters;
create trigger short_scripters_check before insert on short_scripters
  for each row execute procedure short_scripters_check();

create or replace function can_manage_short_people(p_short uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from short_videos s
    where s.id = p_short and (is_team_master(s.team_id) or has_team_role(s.team_id, 'publisher'))
  );
$$;

alter table short_scripters enable row level security;
drop policy if exists "writers readable by teammates" on short_scripters;
create policy "writers readable by teammates" on short_scripters for select to authenticated
  using (short_id in (select my_short_ids()));
drop policy if exists "masters and schedulers add writers" on short_scripters;
create policy "masters and schedulers add writers" on short_scripters for insert to authenticated
  with check (can_manage_short_people(short_id));
drop policy if exists "masters and schedulers remove writers" on short_scripters;
create policy "masters and schedulers remove writers" on short_scripters for delete to authenticated
  using (can_manage_short_people(short_id));
revoke update on short_scripters from anon, authenticated;

-- Team default writer.
alter table teams
  add column if not exists default_short_scripter_member_id uuid references team_members(id) on delete set null;
create index if not exists teams_default_scripter_idx on teams (default_short_scripter_member_id);
grant update (default_short_scripter_member_id) on teams to authenticated;

create or replace function teams_check_short_settings()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  m uuid;
begin
  begin
    perform now() at time zone new.timezone;
  exception when others then
    raise exception 'Unknown time zone: %', new.timezone using errcode = '23514';
  end;
  foreach m in array array[new.default_short_editor_member_id, new.default_short_reviewer_member_id, new.default_short_scheduler_member_id, new.default_short_scripter_member_id] loop
    if m is not null and not exists (
      select 1 from team_members where id = m and team_id = new.id and status = 'active'
    ) then
      raise exception 'Defaults must be active members of this team.' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists teams_check_short_settings on teams;
create trigger teams_check_short_settings
  before insert or update of timezone, default_short_editor_member_id,
    default_short_reviewer_member_id, default_short_scheduler_member_id, default_short_scripter_member_id on teams
  for each row execute procedure teams_check_short_settings();

-- New shorts get the team's default writer.
create or replace function short_add_default_writer()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  m uuid;
begin
  select default_short_scripter_member_id into m from teams where id = new.team_id;
  if m is not null and exists (select 1 from team_members where id = m and team_id = new.team_id and status = 'active') then
    insert into short_scripters (short_id, team_member_id, added_by)
    values (new.id, m, auth.uid())
    on conflict do nothing;
  end if;
  return null;
end;
$$;
drop trigger if exists short_add_default_writer on short_videos;
create trigger short_add_default_writer after insert on short_videos
  for each row execute procedure short_add_default_writer();

-- Who may edit a script: masters, plus the short's writers. (Long-video
-- scripts keep the old rule until they get writers too.)
create or replace function can_edit_script_row(p_team uuid, p_short uuid, p_long uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select case
    when p_short is not null then
      is_team_master(p_team)
      or exists (
        select 1 from short_scripters ss
        join team_members tm on tm.id = ss.team_member_id
        where ss.short_id = p_short and tm.user_id = auth.uid() and tm.status = 'active'
      )
    else is_team_master(p_team) or has_team_role(p_team, 'scripter')
  end;
$$;

create or replace function can_edit_script_id(p_script uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select can_edit_script_row(team_id, short_video_id, long_video_id) from scripts where id = p_script),
    false
  );
$$;

drop policy if exists "masters and scripters create scripts" on scripts;
drop policy if exists "writers create scripts" on scripts;
create policy "writers create scripts" on scripts for insert to authenticated
  with check (can_edit_script_row(team_id, short_video_id, long_video_id));

drop policy if exists "masters and scripters edit scripts" on scripts;
drop policy if exists "writers edit scripts" on scripts;
create policy "writers edit scripts" on scripts for update to authenticated
  using (can_edit_script_row(team_id, short_video_id, long_video_id))
  with check (can_edit_script_row(team_id, short_video_id, long_video_id));

-- Images: the folder is <team>/<script>/…; only that script's editors.
drop policy if exists "script editors upload script images" on storage.objects;
create policy "script editors upload script images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'script-images' and can_edit_script_id(((storage.foldername(name))[2])::uuid));

drop policy if exists "script editors delete script images" on storage.objects;
create policy "script editors delete script images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'script-images' and can_edit_script_id(((storage.foldername(name))[2])::uuid));


-- ---------------------------------------------------------------------------
-- 3. ANIMATIONS (per user)
-- ---------------------------------------------------------------------------

alter table profiles add column if not exists animations_enabled boolean not null default true;
grant update (animations_enabled) on profiles to authenticated;
