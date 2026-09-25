-- ============================================================================
-- 0033: schedulers can assign people
--
-- Everything in a short's Settings window (people, post date, type,
-- platforms, caption, final file) can be changed by a master or a
-- scheduler. Fixed dates and the queue start stay master-only (0032).
-- Staging first, then production.
-- ============================================================================

create or replace function short_guard_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_system boolean := current_setting('vp.short_system', true) = 'on';
  v_master boolean;
  v_scheduler boolean;
  v_editor boolean;
  v_reviewer boolean;
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
    new.pin_kind := coalesce(
      new.pin_kind, old.pin_kind,
      case when is_team_master(old.team_id) and (active_queue_start(old.team_id, old.id)).id is null then 'anchor' else 'oneoff' end
    );
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

  if (new.editor_member_id is distinct from old.editor_member_id
      or new.reviewer_member_id is distinct from old.reviewer_member_id
      or new.scheduler_member_id is distinct from old.scheduler_member_id)
     and not v_scheduler then
    raise exception 'Only the master or a scheduler can change who works on a short.' using errcode = '42501';
  end if;

  -- Fixed dates and the queue start belong to the master.
  if old.schedule_mode = 'pinned'
     and (new.planned_date is distinct from old.planned_date
          or new.schedule_mode is distinct from old.schedule_mode
          or new.pin_kind is distinct from old.pin_kind) then
    raise exception 'Only the master can change a fixed date.' using errcode = '42501';
  end if;
  if new.pin_kind = 'anchor' and new.pin_kind is distinct from old.pin_kind then
    raise exception 'Only the master can start the queue.' using errcode = '42501';
  end if;

  -- Title, type, platforms and dates of Auto shorts: master or scheduler.
  if (new.title is distinct from old.title
      or new.planned_date is distinct from old.planned_date
      or new.schedule_mode is distinct from old.schedule_mode
      or new.pin_kind is distinct from old.pin_kind
      or new.platforms is distinct from old.platforms
      or new.short_type is distinct from old.short_type)
     and not v_scheduler then
    raise exception 'Only the master or a scheduler can change that.' using errcode = '42501';
  end if;

  if (new.caption is distinct from old.caption or new.caption_enabled is distinct from old.caption_enabled)
     and not v_scheduler then
    raise exception 'Only the master or a scheduler can change the caption.' using errcode = '42501';
  end if;

  if new.file_link is distinct from old.file_link
     and not (v_editor or v_scheduler) then
    raise exception 'Only the master, its editor or a scheduler can set the final file.' using errcode = '42501';
  end if;

  return new;
end;
$$;
