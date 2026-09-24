-- ============================================================================
-- 0028: continuous numbering
--
-- Numbers now mean "position in the schedule", always 1, 2, 3 … with no
-- gaps:
--   * Shorts:      ordered by planned date, then queue position.
--   * Long videos: ordered by expected date (undated last), then creation.
-- Whenever something changes the order (create, delete, move up/down,
-- pin / unpin a date, settings), the whole team is renumbered in one
-- statement-safe pass. Moving #5 up one slot makes it #4.
--
-- Staging first, then production.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- SHORTS
-- ---------------------------------------------------------------------------

create or replace function renumber_shorts(p_team uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform set_config('vp.short_system', 'on', true);
  -- Two passes (negative, then positive) so the unique (team, number)
  -- constraint never sees two rows with the same number mid-update.
  with ordered as (
    select id, row_number() over (
      order by planned_date asc nulls last, queue_position, created_at, id
    ) as rn
    from short_videos where team_id = p_team
  )
  update short_videos s set entry_number = -o.rn
    from ordered o
   where s.id = o.id and s.entry_number is distinct from o.rn;

  update short_videos set entry_number = -entry_number
   where team_id = p_team and entry_number < 0;
  perform set_config('vp.short_system', 'off', true);
end;
$$;
revoke all on function renumber_shorts(uuid) from public, anon, authenticated;

-- Re-date, then renumber — every existing caller (create, delete, move,
-- pin/unpin, stage change, settings) now keeps numbers continuous too.
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
  perform renumber_shorts(p_team);
end;
$$;


-- ---------------------------------------------------------------------------
-- LONG VIDEOS
-- ---------------------------------------------------------------------------

create or replace function renumber_long_videos(p_team uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform 1 from teams where id = p_team for update;
  if not found then
    return;
  end if;
  perform set_config('vp.renumber', 'on', true);
  with ordered as (
    select id, row_number() over (
      order by expected_date asc nulls last, created_at, id
    ) as rn
    from long_video_projects where team_id = p_team
  )
  update long_video_projects p set entry_number = -o.rn
    from ordered o
   where p.id = o.id and p.entry_number is distinct from o.rn;

  update long_video_projects set entry_number = -entry_number
   where team_id = p_team and entry_number < 0;
  perform set_config('vp.renumber', 'off', true);
end;
$$;
revoke all on function renumber_long_videos(uuid) from public, anon, authenticated;

-- The project guard allows number changes only from the renumbering above.
create or replace function guard_project_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.team_id is distinct from old.team_id then
    raise exception 'A project can''t be moved to another team.' using errcode = '42501';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'A project''s creator can''t be changed.' using errcode = '42501';
  end if;
  if new.entry_number is distinct from old.entry_number
     and coalesce(current_setting('vp.renumber', true), 'off') <> 'on' then
    raise exception 'Entry numbers can''t be changed.' using errcode = '42501';
  end if;
  if new.stage is distinct from old.stage and not is_team_master(old.team_id) then
    raise exception 'Only the master can change a project''s stage.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function long_videos_order_changed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(current_setting('vp.renumber', true), 'off') = 'on' then
    return null;
  end if;
  perform renumber_long_videos(coalesce(new.team_id, old.team_id));
  return null;
end;
$$;

drop trigger if exists long_videos_order_changed on long_video_projects;
create trigger long_videos_order_changed
  after insert or delete or update of expected_date on long_video_projects
  for each row execute procedure long_videos_order_changed();

-- Speeds up the date-ordered list and the renumbering pass.
create index if not exists projects_team_expected_order_idx
  on long_video_projects (team_id, expected_date, created_at);
create index if not exists short_videos_team_order_idx
  on short_videos (team_id, planned_date, queue_position);


-- ---------------------------------------------------------------------------
-- Apply to everything that exists now.
-- ---------------------------------------------------------------------------

do $$
declare
  t uuid;
begin
  for t in select id from teams loop
    perform renumber_shorts(t);
    perform renumber_long_videos(t);
  end loop;
end $$;
