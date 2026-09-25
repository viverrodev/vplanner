-- ============================================================================
-- 0031: short types, optional caption, Frame.io before review
--
--   * short_videos.short_type: 'filler' | 'sponsorship' | 'big'.
--     New shorts take the team default (teams.default_short_type,
--     'filler' unless changed).
--   * short_videos.caption_enabled: captions are off unless switched on
--     (the team already has an automatic caption for normal shorts).
--   * A short can only go from Editing to In review when its final file
--     is a Frame.io link (frame.io or f.io). Enforced for everyone.
--
-- Staging first, then production.
-- ============================================================================

alter table short_videos
  add column if not exists short_type text not null default 'filler'
    check (short_type in ('filler', 'sponsorship', 'big')),
  add column if not exists caption_enabled boolean not null default false;

-- Shorts that already have a caption keep it switched on.
update short_videos set caption_enabled = true where caption is not null and caption_enabled = false;

create index if not exists short_videos_team_type_idx on short_videos (team_id, short_type);

alter table teams
  add column if not exists default_short_type text not null default 'filler'
    check (default_short_type in ('filler', 'sponsorship', 'big'));
grant update (default_short_type) on teams to authenticated;

-- Is this a Frame.io review link?
create or replace function is_frameio_link(p_link text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_link ~* '^https://([a-z0-9-]+\.)*(frame\.io|f\.io)/\S+$', false);
$$;

-- New shorts: team default type when none is given.
create or replace function short_type_default()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.short_type is null or new.short_type = '' then
    new.short_type := coalesce((select default_short_type from teams where id = new.team_id), 'filler');
  end if;
  return new;
end;
$$;

-- Plain column default is 'filler', so read the team default explicitly
-- when the app doesn't send a type.
alter table short_videos alter column short_type drop default;
drop trigger if exists short_type_default on short_videos;
create trigger short_type_default
  before insert on short_videos
  for each row execute procedure short_type_default();

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

  -- Review needs something to review: a Frame.io link.
  if old.stage = 'editing' and new.stage = 'review' and not is_frameio_link(new.file_link) then
    raise exception 'Add the Frame.io link in Final file first.' using errcode = '23514';
  end if;

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
      or new.platforms is distinct from old.platforms
      or new.short_type is distinct from old.short_type)
     and not (v_scripter and v_in_script) then
    raise exception 'Only the master (or a scripter, while it''s in Script) can change that.' using errcode = '42501';
  end if;

  if (new.caption is distinct from old.caption or new.caption_enabled is distinct from old.caption_enabled)
     and not (v_scheduler or (v_scripter and v_in_script)) then
    raise exception 'Only the master, a scheduler or the scripter can change the caption.' using errcode = '42501';
  end if;

  if new.file_link is distinct from old.file_link
     and not (v_editor or v_scheduler) then
    raise exception 'Only the master, its editor or a scheduler can set the final file.' using errcode = '42501';
  end if;

  return new;
end;
$$;
