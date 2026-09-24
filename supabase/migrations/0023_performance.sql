-- ============================================================================
-- 0023: database performance
--
-- Two kinds of change, neither of which changes WHO can see or do what:
--
-- 1. INDEXES on every column the app filters, joins or sorts by.
--    Postgres indexes primary keys and UNIQUE constraints automatically,
--    but NOT foreign keys — so things like "all comments for project X"
--    or "my unread notifications" were full table scans. Invisible with
--    10 rows, painful with 10,000.
--
-- 2. FASTER READ POLICIES. The old SELECT policies called
--    is_team_member(team_id) once PER ROW — a list of 200 comments meant
--    200 separate membership lookups. The new ones ask "which teams /
--    projects am I in?" ONCE per query (my_team_ids(), my_project_ids())
--    and then just check each row against that list. Same rule, one
--    lookup instead of hundreds. This also speeds up Realtime, which
--    evaluates these policies for every subscriber on every change.
--
--    Also: several tables had a single "FOR ALL" master policy, which
--    Postgres ALSO evaluates on every read. Those are split into separate
--    insert / update / delete policies so reads only pay for the read
--    policy. (A master is always a teammate, so reads are unaffected.)
--
-- Safe to run once. Staging first, then production.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. SET-BASED HELPERS — evaluated once per query inside (select ...)
-- ---------------------------------------------------------------------------

create or replace function my_team_ids()
returns setof uuid
language sql
stable
security definer set search_path = public
as $$
  select team_id from team_members
  where user_id = auth.uid() and status = 'active';
$$;

create or replace function my_master_team_ids()
returns setof uuid
language sql
stable
security definer set search_path = public
as $$
  select tm.team_id
  from team_members tm
  join member_roles mr on mr.team_member_id = tm.id
  where tm.user_id = auth.uid() and tm.status = 'active' and mr.role = 'master';
$$;

create or replace function my_project_ids()
returns setof uuid
language sql
stable
security definer set search_path = public
as $$
  select p.id
  from long_video_projects p
  where p.team_id in (
    select team_id from team_members
    where user_id = auth.uid() and status = 'active'
  );
$$;

-- Every team_members.id in every team I belong to (for member_roles /
-- member_tags, which reference team_members rather than teams).
create or replace function my_teammate_member_ids()
returns setof uuid
language sql
stable
security definer set search_path = public
as $$
  select tm.id
  from team_members tm
  where tm.team_id in (
    select team_id from team_members
    where user_id = auth.uid() and status = 'active'
  );
$$;


-- ---------------------------------------------------------------------------
-- 2. READ POLICIES — same rules, rewritten to use the helpers above
-- ---------------------------------------------------------------------------

drop policy if exists "team members can read their team" on teams;
create policy "team members can read their team"
  on teams for select to authenticated
  using (id in (select my_team_ids()) or owner_id = (select auth.uid()));

drop policy if exists "team members are readable by teammates" on team_members;
create policy "team members are readable by teammates"
  on team_members for select to authenticated
  using (team_id in (select my_team_ids()));

drop policy if exists "roles readable by teammates" on member_roles;
create policy "roles readable by teammates"
  on member_roles for select to authenticated
  using (team_member_id in (select my_teammate_member_ids()));

drop policy if exists "tags readable by teammates" on tags;
create policy "tags readable by teammates"
  on tags for select to authenticated
  using (team_id in (select my_team_ids()));

drop policy if exists "member tags readable by teammates" on member_tags;
create policy "member tags readable by teammates"
  on member_tags for select to authenticated
  using (team_member_id in (select my_teammate_member_ids()));

drop policy if exists "projects readable by teammates" on long_video_projects;
create policy "projects readable by teammates"
  on long_video_projects for select to authenticated
  using (team_id in (select my_team_ids()));

drop policy if exists "titles readable by teammates" on project_titles;
create policy "titles readable by teammates"
  on project_titles for select to authenticated
  using (project_id in (select my_project_ids()));

drop policy if exists "thumbnails readable by teammates" on project_thumbnails;
create policy "thumbnails readable by teammates"
  on project_thumbnails for select to authenticated
  using (project_id in (select my_project_ids()));

drop policy if exists "assignees readable by teammates" on project_assignees;
create policy "assignees readable by teammates"
  on project_assignees for select to authenticated
  using (project_id in (select my_project_ids()));

drop policy if exists "comments readable by teammates" on project_comments;
create policy "comments readable by teammates"
  on project_comments for select to authenticated
  using (project_id in (select my_project_ids()));

drop policy if exists "pins readable by teammates" on video_review_pins;
create policy "pins readable by teammates"
  on video_review_pins for select to authenticated
  using (project_id in (select my_project_ids()));

drop policy if exists "entries readable by teammates" on package_entries;
create policy "entries readable by teammates"
  on package_entries for select to authenticated
  using (project_id in (select my_project_ids()));

drop policy if exists "attachments readable by teammates" on comment_attachments;
create policy "attachments readable by teammates"
  on comment_attachments for select to authenticated
  using (
    exists (
      select 1 from project_comments pc
      where pc.id = comment_attachments.comment_id
        and pc.project_id in (select my_project_ids())
    )
  );

drop policy if exists "role colors readable by teammates" on role_colors;
create policy "role colors readable by teammates"
  on role_colors for select to authenticated
  using (team_id in (select my_team_ids()));

drop policy if exists "connected accounts readable by teammates" on connected_accounts;
create policy "connected accounts readable by teammates"
  on connected_accounts for select to authenticated
  using (team_id in (select my_team_ids()));

drop policy if exists "users read their own notifications" on notifications;
create policy "users read their own notifications"
  on notifications for select to authenticated
  using (recipient_id = (select auth.uid()));

drop policy if exists "users update their own notifications" on notifications;
create policy "users update their own notifications"
  on notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

drop policy if exists "invited user can see their own invites" on team_invites;
create policy "invited user can see their own invites"
  on team_invites for select to authenticated
  using (
    invited_user_id = (select auth.uid())
    or team_id in (select my_master_team_ids())
  );

drop policy if exists "sender and recipient can see the request" on ownership_transfer_requests;
create policy "sender and recipient can see the request"
  on ownership_transfer_requests for select to authenticated
  using (
    from_user_id = (select auth.uid())
    or to_user_id = (select auth.uid())
  );


-- ---------------------------------------------------------------------------
-- 3. SPLIT "FOR ALL" MASTER POLICIES — so reads don't evaluate them
-- ---------------------------------------------------------------------------

-- member_roles (UPDATE was revoked in 0022, so insert + delete only)
drop policy if exists "master manages roles" on member_roles;
create policy "master adds roles" on member_roles for insert to authenticated
  with check (exists (select 1 from team_members tm where tm.id = team_member_id and is_team_master(tm.team_id)));
create policy "master removes roles" on member_roles for delete to authenticated
  using (exists (select 1 from team_members tm where tm.id = team_member_id and is_team_master(tm.team_id)));

-- tags
drop policy if exists "master manages tags" on tags;
create policy "master adds tags" on tags for insert to authenticated
  with check (is_team_master(team_id));
create policy "master edits tags" on tags for update to authenticated
  using (is_team_master(team_id)) with check (is_team_master(team_id));
create policy "master removes tags" on tags for delete to authenticated
  using (is_team_master(team_id));

-- member_tags
drop policy if exists "master manages member tags" on member_tags;
create policy "master adds member tags" on member_tags for insert to authenticated
  with check (exists (select 1 from team_members tm where tm.id = team_member_id and is_team_master(tm.team_id)));
create policy "master removes member tags" on member_tags for delete to authenticated
  using (exists (select 1 from team_members tm where tm.id = team_member_id and is_team_master(tm.team_id)));

-- project_titles
drop policy if exists "ideate-access can manage titles" on project_titles;
create policy "ideate-access adds titles" on project_titles for insert to authenticated
  with check (member_has_stage_access(team_id_for_project(project_id), 'ideate') or is_team_master(team_id_for_project(project_id)));
create policy "ideate-access edits titles" on project_titles for update to authenticated
  using (member_has_stage_access(team_id_for_project(project_id), 'ideate') or is_team_master(team_id_for_project(project_id)))
  with check (member_has_stage_access(team_id_for_project(project_id), 'ideate') or is_team_master(team_id_for_project(project_id)));
create policy "ideate-access removes titles" on project_titles for delete to authenticated
  using (member_has_stage_access(team_id_for_project(project_id), 'ideate') or is_team_master(team_id_for_project(project_id)));

-- project_thumbnails
drop policy if exists "ideate-access can manage thumbnails" on project_thumbnails;
create policy "ideate-access adds thumbnails" on project_thumbnails for insert to authenticated
  with check (member_has_stage_access(team_id_for_project(project_id), 'ideate') or is_team_master(team_id_for_project(project_id)));
create policy "ideate-access edits thumbnails" on project_thumbnails for update to authenticated
  using (member_has_stage_access(team_id_for_project(project_id), 'ideate') or is_team_master(team_id_for_project(project_id)))
  with check (member_has_stage_access(team_id_for_project(project_id), 'ideate') or is_team_master(team_id_for_project(project_id)));
create policy "ideate-access removes thumbnails" on project_thumbnails for delete to authenticated
  using (member_has_stage_access(team_id_for_project(project_id), 'ideate') or is_team_master(team_id_for_project(project_id)));

-- package_entries
drop policy if exists "package-access can manage entries" on package_entries;
create policy "package-access adds entries" on package_entries for insert to authenticated
  with check (member_has_stage_access(team_id_for_project(project_id), 'package') or is_team_master(team_id_for_project(project_id)));
create policy "package-access edits entries" on package_entries for update to authenticated
  using (member_has_stage_access(team_id_for_project(project_id), 'package') or is_team_master(team_id_for_project(project_id)))
  with check (member_has_stage_access(team_id_for_project(project_id), 'package') or is_team_master(team_id_for_project(project_id)));
create policy "package-access removes entries" on package_entries for delete to authenticated
  using (member_has_stage_access(team_id_for_project(project_id), 'package') or is_team_master(team_id_for_project(project_id)));

-- role_colors
drop policy if exists "master manages role colors" on role_colors;
create policy "master adds role colors" on role_colors for insert to authenticated
  with check (is_team_master(team_id));
create policy "master edits role colors" on role_colors for update to authenticated
  using (is_team_master(team_id)) with check (is_team_master(team_id));
create policy "master removes role colors" on role_colors for delete to authenticated
  using (is_team_master(team_id));

-- connected_accounts
drop policy if exists "master manages connected accounts" on connected_accounts;
create policy "master adds connected accounts" on connected_accounts for insert to authenticated
  with check (is_team_master(team_id));
create policy "master edits connected accounts" on connected_accounts for update to authenticated
  using (is_team_master(team_id)) with check (is_team_master(team_id));
create policy "master removes connected accounts" on connected_accounts for delete to authenticated
  using (is_team_master(team_id));


-- ---------------------------------------------------------------------------
-- 4. INDEXES
-- ---------------------------------------------------------------------------

-- membership lookups (used by nearly every policy and page)
create index if not exists team_members_user_status_idx on team_members (user_id, status);
create index if not exists team_members_team_status_idx on team_members (team_id, status);
create index if not exists teams_owner_idx on teams (owner_id);
create index if not exists member_roles_role_idx on member_roles (role);
create index if not exists tags_team_idx on tags (team_id);
create index if not exists member_tags_tag_idx on member_tags (tag_id);

-- projects: list page (newest first), stage filter, calendar, authorship
create index if not exists projects_team_created_idx on long_video_projects (team_id, created_at desc);
create index if not exists projects_team_stage_idx on long_video_projects (team_id, stage);
create index if not exists projects_team_expected_idx on long_video_projects (team_id, expected_date)
  where expected_date is not null;
create index if not exists projects_created_by_idx on long_video_projects (created_by);
create index if not exists projects_updated_by_idx on long_video_projects (updated_by);

-- project children
create index if not exists project_titles_project_idx on project_titles (project_id, position);
create index if not exists project_thumbnails_project_idx on project_thumbnails (project_id, position);
create index if not exists project_assignees_member_idx on project_assignees (team_member_id);
create index if not exists project_comments_project_stage_idx on project_comments (project_id, stage, created_at);
create index if not exists project_comments_author_idx on project_comments (author_id);
create index if not exists comment_attachments_comment_idx on comment_attachments (comment_id);
create index if not exists video_review_pins_project_idx on video_review_pins (project_id, timestamp_seconds);
create index if not exists video_review_pins_author_idx on video_review_pins (author_id);
create index if not exists package_entries_project_idx on package_entries (project_id);

-- notifications: the bell (newest first) + unread badge + cascade deletes
create index if not exists notifications_recipient_created_idx on notifications (recipient_id, created_at desc);
create index if not exists notifications_recipient_unread_idx on notifications (recipient_id) where not is_read;
create index if not exists notifications_project_idx on notifications (project_id);
create index if not exists notifications_invite_idx on notifications (team_invite_id);
create index if not exists notifications_transfer_idx on notifications (ownership_transfer_id);

-- invites & ownership transfers
create index if not exists team_invites_invited_status_idx on team_invites (invited_user_id, status);
create index if not exists team_invites_team_status_idx on team_invites (team_id, status);
create index if not exists team_invites_invited_by_idx on team_invites (invited_by);
create index if not exists ownership_requests_to_idx on ownership_transfer_requests (to_user_id);
create index if not exists ownership_requests_from_idx on ownership_transfer_requests (from_user_id);
create index if not exists ownership_requests_team_status_idx on ownership_transfer_requests (team_id, status);

-- Refresh the planner's statistics so it starts using the new indexes
-- straight away.
analyze;
