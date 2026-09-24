-- ============================================================================
-- 0027: shorts scheduling queue, reviewer + scheduler, team defaults
--
--   * TEAM SETTINGS: shorts per day (1–10), post on weekends, time zone,
--     and default editor / reviewer / scheduler for new shorts.
--   * AUTO DATES: every short is either
--        'auto'   — sits in the team's queue; its date is CALCULATED, N per
--                   day, skipping weekends if they're off, closing gaps
--                   whenever something changes (create, delete, reorder,
--                   settings); or
--        'pinned' — a date someone chose; the queue flows around it and it
--                   counts toward that day's N.
--     Shorts that are posted (or partly posted), and auto shorts whose
--     date is already in the past, never move.
--   * REORDER: move_short(id, -1 | 1) swaps a short with its neighbour in
--     the queue; dates recalculate.
--   * REVIEWER per short (notified; may Approve / ask for changes).
--     SCHEDULER per short (notified when approved).
--   * POSTED IS LOCKED: no one can move a posted short to another stage.
--     Un-marking a platform is the way back (→ Ready, automatically).
--
-- Staging first, then production.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. TEAM SETTINGS
-- ---------------------------------------------------------------------------

alter table teams
  add column if not exists shorts_per_day int not null default 2 check (shorts_per_day between 1 and 10),
  add column if not exists shorts_weekends boolean not null default true,
  add column if not exists timezone text not null default 'Europe/Bucharest',
  add column if not exists default_short_editor_member_id uuid references team_members(id) on delete set null,
  add column if not exists default_short_reviewer_member_id uuid references team_members(id) on delete set null,
  add column if not exists default_short_scheduler_member_id uuid references team_members(id) on delete set null;

-- Masters may edit these (same column-grant approach as 0022).
grant update (
  shorts_per_day, shorts_weekends, timezone,
  default_short_editor_member_id, default_short_reviewer_member_id, default_short_scheduler_member_id
) on teams to authenticated;

create index if not exists teams_default_editor_idx on teams (default_short_editor_member_id);
create index if not exists teams_default_reviewer_idx on teams (default_short_reviewer_member_id);
create index if not exists teams_default_scheduler_idx on teams (default_short_scheduler_member_id);

-- Validate: real time zone; defaults must be active members of THIS team.
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
  foreach m in array array[new.default_short_editor_member_id, new.default_short_reviewer_member_id, new.default_short_scheduler_member_id] loop
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
    default_short_reviewer_member_id, default_short_scheduler_member_id on teams
  for each row execute procedure teams_check_short_settings();


-- ---------------------------------------------------------------------------
-- 2. NEW COLUMNS ON SHORTS
-- ---------------------------------------------------------------------------

alter table short_videos
  add column if not exists schedule_mode text not null default 'auto' check (schedule_mode in ('auto', 'pinned')),
  add column if not exists queue_position bigint,
  add column if not exists reviewer_member_id uuid references team_members(id) on delete set null,
  add column if not exists scheduler_member_id uuid references team_members(id) on delete set null;

create index if not exists short_videos_reviewer_idx on short_videos (reviewer_member_id);
create index if not exists short_videos_scheduler_idx on short_videos (scheduler_member_id);
create index if not exists short_videos_team_queue_idx on short_videos (team_id, queue_position);

-- Existing shorts keep the date they already have (pinned); undated ones
-- join the queue. Queue order starts as creation order.
update short_videos set schedule_mode = case when planned_date is null then 'auto' else 'pinned' end
 where queue_position is null;
update short_videos set queue_position = entry_number where queue_position is null;
insert into team_counters (team_id, kind, value)
select team_id, 'short_queue', max(queue_position) from short_videos group by team_id
on conflict (team_id, kind) do update set value = greatest(team_counters.value, excluded.value);
alter table short_videos alter column queue_position set not null;


-- ---------------------------------------------------------------------------
-- 3. THE QUEUE
-- ---------------------------------------------------------------------------

-- "Today" in the team's time zone.
create or replace function team_today(p_team uuid)
returns date
language sql
stable
security definer set search_path = public
as $$
  select (now() at time zone t.timezone)::date from teams t where t.id = p_team;
$$;

-- Is this short part of the moving queue right now?
create or replace function short_in_queue(s short_videos, p_today date)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select s.schedule_mode = 'auto'
     and s.stage <> 'posted'
     and (s.planned_date is null or s.planned_date >= p_today)
     and not exists (select 1 from short_video_posts p where p.short_id = s.id);
$$;

-- The date every queued short SHOULD have (and, with p_extra, the date
-- the next new short would get). Fixed shorts fill their days first;
-- queued shorts fill remaining slots in queue order, from today on.
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
  r record;
begin
  select t.shorts_per_day, t.shorts_weekends, (now() at time zone t.timezone)::date
    into v_per_day, v_weekends, v_today
    from teams t where t.id = p_team;
  if not found then
    return;
  end if;

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

  v_day := v_today;
  for r in
    select s.id
      from short_videos s
     where s.team_id = p_team and short_in_queue(s, v_today)
     order by s.queue_position, s.entry_number
  loop
    loop
      exit when (v_weekends or extract(isodow from v_day) < 6)
            and coalesce((v_used ->> v_day::text)::int, 0) < v_per_day;
      v_day := v_day + 1;
    end loop;
    v_used := jsonb_set(v_used, array[v_day::text], to_jsonb(coalesce((v_used ->> v_day::text)::int, 0) + 1));
    short_id := r.id;
    slot_date := v_day;
    return next;
  end loop;

  if p_extra then
    loop
      exit when (v_weekends or extract(isodow from v_day) < 6)
            and coalesce((v_used ->> v_day::text)::int, 0) < v_per_day;
      v_day := v_day + 1;
    end loop;
    short_id := null;
    slot_date := v_day;
    return next;
  end if;
end;
$$;

-- Apply the plan. Serialized per team (row lock), and flagged as a
-- system write so the guard lets the date changes through.
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
  perform set_config('vp.short_system', 'off', true);
end;
$$;

revoke all on function short_queue_plan(uuid, boolean) from public, anon, authenticated;
revoke all on function recalc_short_queue(uuid) from public, anon, authenticated;
revoke all on function short_in_queue(short_videos, date) from public, anon, authenticated;

-- For the "will be scheduled for …" preview. Teammates only.
create or replace function next_short_slot(p_team uuid)
returns date
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if not (p_team in (select my_team_ids())) then
    raise exception 'Not a member of this team.' using errcode = '42501';
  end if;
  return (select slot_date from short_queue_plan(p_team, true) where short_id is null);
end;
$$;
revoke all on function next_short_slot(uuid) from public, anon;
grant execute on function next_short_slot(uuid) to authenticated;

-- Move up (-1) / down (+1) one slot. Master only; queued shorts only.
create or replace function move_short(p_short uuid, p_direction int)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  s short_videos;
  o short_videos;
  v_today date;
  v_pos bigint;
begin
  select * into s from short_videos where id = p_short;
  if not found then
    raise exception 'Short not found.' using errcode = 'P0002';
  end if;
  if not is_team_master(s.team_id) then
    raise exception 'Only the master can reorder shorts.' using errcode = '42501';
  end if;

  perform 1 from teams where id = s.team_id for update;
  v_today := team_today(s.team_id);

  if not short_in_queue(s, v_today) then
    raise exception 'Only auto-scheduled, unposted, upcoming shorts can be moved. Set this one back to Auto first.' using errcode = '23514';
  end if;

  if p_direction < 0 then
    select * into o from short_videos x
     where x.team_id = s.team_id and short_in_queue(x, v_today)
       and (x.queue_position, x.entry_number) < (s.queue_position, s.entry_number)
     order by x.queue_position desc, x.entry_number desc limit 1;
  else
    select * into o from short_videos x
     where x.team_id = s.team_id and short_in_queue(x, v_today)
       and (x.queue_position, x.entry_number) > (s.queue_position, s.entry_number)
     order by x.queue_position, x.entry_number limit 1;
  end if;

  if not found then
    raise exception '%', case when p_direction < 0 then 'It''s already first in the queue.' else 'It''s already last in the queue.' end
      using errcode = '23514';
  end if;

  perform set_config('vp.short_system', 'on', true);
  v_pos := s.queue_position;
  update short_videos set queue_position = o.queue_position where id = s.id;
  update short_videos set queue_position = v_pos where id = o.id;
  perform set_config('vp.short_system', 'off', true);

  perform recalc_short_queue(s.team_id);
end;
$$;
revoke all on function move_short(uuid, int) from public, anon;
grant execute on function move_short(uuid, int) to authenticated;


-- ---------------------------------------------------------------------------
-- 4. TRIGGERS (replacing 0026 versions where needed)
-- ---------------------------------------------------------------------------

create or replace function short_before_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.entry_number := next_team_number(new.team_id, 'short_video');
  new.queue_position := next_team_number(new.team_id, 'short_queue');
  new.title := btrim(new.title);
  new.schedule_mode := case when new.planned_date is null then 'auto' else 'pinned' end;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

-- Editor, reviewer and scheduler must all be active members of the team.
create or replace function short_check_editor()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  m uuid;
begin
  foreach m in array array[new.editor_member_id, new.reviewer_member_id, new.scheduler_member_id] loop
    if m is not null and not exists (
      select 1 from team_members where id = m and team_id = new.team_id and status = 'active'
    ) then
      raise exception 'People on a short must be active members of this team.' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists short_check_editor on short_videos;
create trigger short_check_editor
  before insert or update of editor_member_id, reviewer_member_id, scheduler_member_id on short_videos
  for each row execute procedure short_check_editor();

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

  -- Posted is final — for everyone. Un-mark a platform to reopen it.
  if old.stage = 'posted' and new.stage is distinct from old.stage then
    raise exception 'This short is posted and locked. Un-mark a platform to reopen it.' using errcode = '42501';
  end if;

  -- Choosing a date pins it; clearing the date (or asking for auto)
  -- puts it back in the queue.
  if new.planned_date is distinct from old.planned_date then
    new.schedule_mode := case when new.planned_date is null then 'auto' else 'pinned' end;
  end if;
  if new.schedule_mode = 'auto' and old.schedule_mode = 'pinned' then
    new.planned_date := null; -- the queue assigns it right after
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

-- Keep the queue right after anything that can change it.
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
     or new.stage is distinct from old.stage then
    perform recalc_short_queue(new.team_id);
  end if;
  return null;
end;
$$;

drop trigger if exists short_queue_changed on short_videos;
create trigger short_queue_changed
  after insert or delete or update on short_videos
  for each row execute procedure short_queue_changed();

-- Settings changed → reflow.
create or replace function teams_short_settings_changed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.shorts_per_day is distinct from old.shorts_per_day
     or new.shorts_weekends is distinct from old.shorts_weekends
     or new.timezone is distinct from old.timezone then
    perform recalc_short_queue(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists teams_short_settings_changed on teams;
create trigger teams_short_settings_changed
  after update of shorts_per_day, shorts_weekends, timezone on teams
  for each row execute procedure teams_short_settings_changed();

-- Give every team's undated shorts a date now.
do $$
declare
  t uuid;
begin
  for t in select distinct team_id from short_videos loop
    perform recalc_short_queue(t);
  end loop;
end $$;
