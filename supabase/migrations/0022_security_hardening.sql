-- ============================================================================
-- 0022: security hardening
--
-- Closes the holes found in the post-handoff audit. The one principle
-- behind almost every change here:
--
--   Anything the app writes with the admin client (service role) must
--   come from data a user CANNOT edit. So users lose direct UPDATE
--   access to invites, ownership requests and notifications, and the
--   server does those writes itself after checking everything.
--
-- Triggers below only guard requests made by a logged-in user
-- (auth.uid() is not null). The server's admin client, the Supabase
-- dashboard, and foreign-key cascades all run with auth.uid() = null
-- and pass through — the app code is responsible for those.
--
-- Safe to run once. Run on STAGING first, test, then PRODUCTION.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. TEAM INVITES — the invited person can no longer edit their invite
--    (previously they could rewrite team_id / proposed_roles and then
--    accept into any team as Master).
-- ---------------------------------------------------------------------------

drop policy if exists "invited user can respond to their own invite" on team_invites;
revoke update on team_invites from anon, authenticated;

-- Master can never be handed out through an invite.
update team_invites set proposed_roles = array_remove(proposed_roles, 'master')
  where 'master' = any(proposed_roles);
alter table team_invites drop constraint if exists team_invites_no_master;
alter table team_invites add constraint team_invites_no_master
  check (not ('master' = any(proposed_roles)));


-- ---------------------------------------------------------------------------
-- 2. SELF-JOIN POLICIES FROM 0013/0018 — accepting now happens entirely
--    on the server, so these only served as a back door (anyone with a
--    pending invite could insert themselves with any role, incl. Master).
--    Also removes the old "master adds a member directly" path from the
--    pre-invite era — membership is only ever created by accepting.
-- ---------------------------------------------------------------------------

drop policy if exists "invited user can join by accepting their own invite" on team_members;
drop policy if exists "invited user can accept their proposed roles" on member_roles;
drop function if exists has_pending_invite(uuid, uuid);

drop policy if exists "master can invite members" on team_members;
drop policy if exists "master can update members" on team_members;
revoke insert, update on team_members from anon, authenticated;
-- (DELETE stays: that's how the master kicks someone.)

revoke update on member_roles from anon, authenticated;
-- (Roles are changed by delete + insert, never by editing a row.)


-- ---------------------------------------------------------------------------
-- 3. OWNERSHIP TRANSFER REQUESTS — same fix as invites.
-- ---------------------------------------------------------------------------

drop policy if exists "recipient can respond to their own request" on ownership_transfer_requests;
revoke update on ownership_transfer_requests from anon, authenticated;

-- These FKs had no ON DELETE rule, which silently blocked deleting any
-- account that had ever sent or received a transfer request.
alter table ownership_transfer_requests drop constraint if exists ownership_transfer_requests_from_user_id_fkey;
alter table ownership_transfer_requests add constraint ownership_transfer_requests_from_user_id_fkey
  foreign key (from_user_id) references profiles(id) on delete cascade;
alter table ownership_transfer_requests drop constraint if exists ownership_transfer_requests_to_user_id_fkey;
alter table ownership_transfer_requests add constraint ownership_transfer_requests_to_user_id_fkey
  foreign key (to_user_id) references profiles(id) on delete cascade;


-- ---------------------------------------------------------------------------
-- 4. NOTIFICATIONS — created only by the server now (stops anyone
--    forging notifications to teammates). Users may only flip is_read.
-- ---------------------------------------------------------------------------

drop policy if exists "authenticated users can create notifications" on notifications;
revoke insert, update on notifications from anon, authenticated;
grant update (is_read) on notifications to authenticated;


-- ---------------------------------------------------------------------------
-- 5. PROFILES — users can edit their own profile, but not the email
--    column (it's used as a display-name fallback, so it shouldn't be
--    spoofable).
-- ---------------------------------------------------------------------------

revoke update on profiles from anon, authenticated;
grant update (full_name, avatar_url, bio, username, teams_visible, updated_at)
  on profiles to authenticated;


-- ---------------------------------------------------------------------------
-- 6. TEAMS — any Master can edit name/logo/color (the app already
--    offered this, but RLS was owner-only, so non-owner masters' edits
--    silently did nothing). owner_id can only change via the transfer
--    flow on the server.
-- ---------------------------------------------------------------------------

drop policy if exists "owner can update their team" on teams;
drop policy if exists "masters can update team details" on teams;
create policy "masters can update team details"
  on teams for update to authenticated
  using (is_team_master(id))
  with check (is_team_master(id));

revoke update on teams from anon, authenticated;
grant update (name, logo_url, color) on teams to authenticated;


-- ---------------------------------------------------------------------------
-- 7. OWNER PROTECTION — the owner's membership row can't be deleted and
--    their Master role can't be removed. Only the OWNER can grant or
--    remove Master for anyone else.
-- ---------------------------------------------------------------------------

create or replace function protect_owner_membership()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    return old;
  end if;
  if exists (select 1 from teams where id = old.team_id and owner_id = old.user_id) then
    raise exception 'The team owner can''t be removed from the team.'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists protect_owner_membership on team_members;
create trigger protect_owner_membership
  before delete on team_members
  for each row execute procedure protect_owner_membership();

create or replace function guard_master_role()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_row member_roles;
  v_team uuid;
  v_member_user uuid;
  v_owner uuid;
begin
  if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;

  if v_row.role <> 'master' or auth.uid() is null then
    return v_row;
  end if;

  select team_id, user_id into v_team, v_member_user
  from team_members where id = v_row.team_member_id;
  if not found then
    return v_row; -- membership row already gone (kick / team delete cascade)
  end if;

  select owner_id into v_owner from teams where id = v_team;
  if v_owner is null then
    return v_row; -- team is being deleted
  end if;

  if tg_op = 'DELETE' and v_member_user = v_owner then
    raise exception 'The team owner is always Master.' using errcode = '42501';
  end if;

  if auth.uid() <> v_owner then
    raise exception 'Only the team owner can grant or remove Master.' using errcode = '42501';
  end if;

  return v_row;
end;
$$;

drop trigger if exists guard_master_role on member_roles;
create trigger guard_master_role
  before insert or delete on member_roles
  for each row execute procedure guard_master_role();


-- ---------------------------------------------------------------------------
-- 8. PROJECTS — only a Master can change a project's stage (previously
--    anyone holding two adjacent roles could move it themselves), and a
--    project can never be moved to another team or have its creator
--    rewritten. New projects always start in Ideate unless a Master
--    creates them.
-- ---------------------------------------------------------------------------

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
  if new.stage is distinct from old.stage and not is_team_master(old.team_id) then
    raise exception 'Only the master can change a project''s stage.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_project_update on long_video_projects;
create trigger guard_project_update
  before update on long_video_projects
  for each row execute procedure guard_project_update();

drop policy if exists "teammates can create projects" on long_video_projects;
create policy "teammates can create projects"
  on long_video_projects for insert to authenticated
  with check (
    is_team_member(team_id)
    and created_by = auth.uid()
    and (stage = 'ideate' or is_team_master(team_id))
  );

-- 0014 missed this FK: deleting an account that had ever edited a
-- project was blocked.
alter table long_video_projects drop constraint if exists long_video_projects_updated_by_fkey;
alter table long_video_projects add constraint long_video_projects_updated_by_fkey
  foreign key (updated_by) references profiles(id) on delete set null;


-- ---------------------------------------------------------------------------
-- 9. ASSIGNEES — the assigned person must be an active member of the
--    SAME team, holding a role that covers that stage.
-- ---------------------------------------------------------------------------

drop policy if exists "master manages assignees" on project_assignees;
create policy "master removes assignees"
  on project_assignees for delete to authenticated
  using (is_team_master(team_id_for_project(project_id)));
create policy "master assigns eligible teammates"
  on project_assignees for insert to authenticated
  with check (
    is_team_master(team_id_for_project(project_id))
    and exists (
      select 1
      from team_members tm
      join member_roles mr on mr.team_member_id = tm.id
      where tm.id = project_assignees.team_member_id
        and tm.team_id = team_id_for_project(project_assignees.project_id)
        and tm.status = 'active'
        and role_allows_stage(mr.role, project_assignees.stage)
    )
  );
revoke update on project_assignees from anon, authenticated;


-- ---------------------------------------------------------------------------
-- 10. COMMENT ATTACHMENTS — the file must live in THIS project's folder,
--     or be a Giphy GIF. Previously any URL could be stored and would
--     render for every teammate.
-- ---------------------------------------------------------------------------

drop policy if exists "comment author can add attachments" on comment_attachments;
create policy "comment author can add attachments"
  on comment_attachments for insert to authenticated
  with check (
    exists (
      select 1 from project_comments pc
      where pc.id = comment_id
        and pc.author_id = auth.uid()
        and (
          comment_attachments.file_path like pc.project_id::text || '/%'
          or comment_attachments.file_path ~ '^https://([a-z0-9-]+\.)?giphy\.com/'
        )
    )
  );
revoke update on comment_attachments from anon, authenticated;


-- ---------------------------------------------------------------------------
-- 11. CLEANUP — debug helper from the 0018 investigation.
-- ---------------------------------------------------------------------------

drop function if exists get_auth_uid_debug();
