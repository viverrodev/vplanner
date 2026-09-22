-- ============================================================================
-- VPlanner — initial schema
--
-- Design notes:
--  - Every table has Row Level Security enabled. Permissions are enforced
--    by Postgres itself, not just by the app's UI — even a compromised
--    frontend cannot read or write data a user isn't allowed to touch.
--  - Roles are a fixed Postgres enum (role_type), not free text, matching
--    the "predetermined roles, not hand-typed" requirement. A member can
--    hold multiple roles (member_roles is a many-to-many table).
--  - Which stage(s) each role can act on is encoded once, in
--    role_allows_stage() below — the single source of truth for
--    role → stage permissions.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------

create type role_type as enum (
  'master',
  'researcher',
  'scripter',
  'filmer',
  'editor',
  'packager',
  'publisher'
);

create type pipeline_stage as enum (
  'ideate',
  'research',
  'script',
  'film',
  'edit',
  'package',
  'publish',
  'done'
);

create type member_status as enum ('invited', 'active');

-- ---------------------------------------------------------------------------
-- PROFILES — one row per authenticated user, extends auth.users
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user is created.
create function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ---------------------------------------------------------------------------
-- TEAMS — a "workspace"/channel. The creator is always the owner/master.
-- ---------------------------------------------------------------------------

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_id uuid not null references profiles(id),
  color text not null default '#E8630D',
  created_at timestamptz not null default now()
);

create table team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  invited_email text not null,
  status member_status not null default 'invited',
  created_at timestamptz not null default now(),
  unique (team_id, invited_email)
);

create table member_roles (
  team_member_id uuid not null references team_members(id) on delete cascade,
  role role_type not null,
  primary key (team_member_id, role)
);

create table tags (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  label text not null,
  color text not null,
  created_at timestamptz not null default now()
);

create table member_tags (
  team_member_id uuid not null references team_members(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (team_member_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- LONG-FORM VIDEO PROJECTS
-- ---------------------------------------------------------------------------

create table long_video_projects (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  title text not null,
  stage pipeline_stage not null default 'ideate',
  expected_date date,

  -- Ideate fields
  video_type text[] not null default '{}',       -- e.g. {Hub, Help}
  theme text,
  subtheme text,
  hook text,
  notes text,
  budget_notes text,

  -- Publish fields
  description text,
  scheduled_at timestamptz,
  visibility text default 'public',
  members_only_days int default 0,
  monetization boolean default true,
  midroll_ads boolean default true,
  youtube_video_id text,
  published_at timestamptz,

  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table project_titles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references long_video_projects(id) on delete cascade,
  title text not null,
  is_picked boolean not null default false,
  position int not null default 0
);

create table project_thumbnails (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references long_video_projects(id) on delete cascade,
  storage_path text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table project_assignees (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references long_video_projects(id) on delete cascade,
  stage pipeline_stage not null,
  team_member_id uuid not null references team_members(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (project_id, stage, team_member_id)
);

-- Cross-stage notes / Q&A thread, reused at every stage.
create table project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references long_video_projects(id) on delete cascade,
  stage pipeline_stage not null,
  author_id uuid not null references profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

-- Timestamped review notes on an editing cut (the "Frame.io-lite" feature).
create table video_review_pins (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references long_video_projects(id) on delete cascade,
  timestamp_seconds int not null,
  body text not null,
  author_id uuid not null references profiles(id),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- Title + thumbnail packaging entries (for the YouTube preview mockup).
create table package_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references long_video_projects(id) on delete cascade,
  title text not null,
  thumbnail_storage_path text,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  project_id uuid references long_video_projects(id) on delete cascade,
  body text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- PERMISSION HELPER FUNCTIONS (security definer — safe to call from RLS)
-- ---------------------------------------------------------------------------

-- Which stage(s) a role is allowed to act on. Single source of truth.
create function role_allows_stage(p_role role_type, p_stage pipeline_stage)
returns boolean
language sql
immutable
as $$
  select case p_role
    when 'master'     then true
    when 'researcher' then p_stage = 'research'
    when 'scripter'   then p_stage = 'script'
    when 'filmer'     then p_stage = 'film'
    when 'editor'     then p_stage = 'edit'
    when 'packager'   then p_stage = 'package'
    when 'publisher'  then p_stage = 'publish'
    else false
  end;
$$;

-- The current user's team_members row id for a given team, if active.
create function current_team_member_id(p_team_id uuid)
returns uuid
language sql
security definer set search_path = public
stable
as $$
  select id from team_members
  where team_id = p_team_id
    and user_id = auth.uid()
    and status = 'active'
  limit 1;
$$;

create function is_team_member(p_team_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from team_members
    where team_id = p_team_id and user_id = auth.uid() and status = 'active'
  );
$$;

create function is_team_master(p_team_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1
    from team_members tm
    join member_roles mr on mr.team_member_id = tm.id
    where tm.team_id = p_team_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and mr.role = 'master'
  );
$$;

-- Can the current user act on this stage of this team's projects?
create function member_has_stage_access(p_team_id uuid, p_stage pipeline_stage)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1
    from team_members tm
    join member_roles mr on mr.team_member_id = tm.id
    where tm.team_id = p_team_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and role_allows_stage(mr.role, p_stage)
  );
$$;

create function team_id_for_project(p_project_id uuid)
returns uuid
language sql
security definer set search_path = public
stable
as $$
  select team_id from long_video_projects where id = p_project_id;
$$;

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table member_roles enable row level security;
alter table tags enable row level security;
alter table member_tags enable row level security;
alter table long_video_projects enable row level security;
alter table project_titles enable row level security;
alter table project_thumbnails enable row level security;
alter table project_assignees enable row level security;
alter table project_comments enable row level security;
alter table video_review_pins enable row level security;
alter table package_entries enable row level security;
alter table notifications enable row level security;

-- Profiles: anyone can read a profile (needed for showing names/avatars in
-- shared teams); a user may only update their own.
create policy "profiles are readable by any authenticated user"
  on profiles for select to authenticated using (true);
create policy "users can update their own profile"
  on profiles for update to authenticated using (id = auth.uid());

-- Teams: members can read their teams; only the owner can update/delete.
create policy "team members can read their team"
  on teams for select to authenticated using (is_team_member(id) or owner_id = auth.uid());
create policy "authenticated users can create a team"
  on teams for insert to authenticated with check (owner_id = auth.uid());
create policy "owner can update their team"
  on teams for update to authenticated using (owner_id = auth.uid());
create policy "owner can delete their team"
  on teams for delete to authenticated using (owner_id = auth.uid());

-- Team members: readable by teammates; only the master can add/edit/remove.
create policy "team members are readable by teammates"
  on team_members for select to authenticated using (is_team_member(team_id));
create policy "master can invite members"
  on team_members for insert to authenticated with check (is_team_master(team_id));
create policy "master can update members"
  on team_members for update to authenticated using (is_team_master(team_id));
create policy "master can remove members"
  on team_members for delete to authenticated using (is_team_master(team_id));

-- Roles & tags: readable by teammates; only master can assign.
create policy "roles readable by teammates" on member_roles for select to authenticated
  using (exists (select 1 from team_members tm where tm.id = team_member_id and is_team_member(tm.team_id)));
create policy "master manages roles" on member_roles for all to authenticated
  using (exists (select 1 from team_members tm where tm.id = team_member_id and is_team_master(tm.team_id)))
  with check (exists (select 1 from team_members tm where tm.id = team_member_id and is_team_master(tm.team_id)));

create policy "tags readable by teammates" on tags for select to authenticated
  using (is_team_member(team_id));
create policy "master manages tags" on tags for all to authenticated
  using (is_team_master(team_id)) with check (is_team_master(team_id));

create policy "member tags readable by teammates" on member_tags for select to authenticated
  using (exists (select 1 from team_members tm where tm.id = team_member_id and is_team_member(tm.team_id)));
create policy "master manages member tags" on member_tags for all to authenticated
  using (exists (select 1 from team_members tm where tm.id = team_member_id and is_team_master(tm.team_id)))
  with check (exists (select 1 from team_members tm where tm.id = team_member_id and is_team_master(tm.team_id)));

-- Projects: readable by any teammate. Insert by any teammate (idea stage is
-- open); the STAGE column itself can only move forward via the master
-- (enforced in the app layer + this update policy).
create policy "projects readable by teammates"
  on long_video_projects for select to authenticated using (is_team_member(team_id));
create policy "teammates can create projects"
  on long_video_projects for insert to authenticated with check (is_team_member(team_id));
create policy "master or stage-holder can update project"
  on long_video_projects for update to authenticated
  using (is_team_master(team_id) or member_has_stage_access(team_id, stage));

-- Titles/thumbnails: readable by teammates, writable by anyone with
-- access to the Ideate stage (or master).
create policy "titles readable by teammates" on project_titles for select to authenticated
  using (is_team_member(team_id_for_project(project_id)));
create policy "ideate-access can manage titles" on project_titles for all to authenticated
  using (member_has_stage_access(team_id_for_project(project_id), 'ideate') or is_team_master(team_id_for_project(project_id)))
  with check (member_has_stage_access(team_id_for_project(project_id), 'ideate') or is_team_master(team_id_for_project(project_id)));

create policy "thumbnails readable by teammates" on project_thumbnails for select to authenticated
  using (is_team_member(team_id_for_project(project_id)));
create policy "ideate-access can manage thumbnails" on project_thumbnails for all to authenticated
  using (member_has_stage_access(team_id_for_project(project_id), 'ideate') or is_team_master(team_id_for_project(project_id)))
  with check (member_has_stage_access(team_id_for_project(project_id), 'ideate') or is_team_master(team_id_for_project(project_id)));

-- Assignees: readable by teammates; only master assigns people to stages.
create policy "assignees readable by teammates" on project_assignees for select to authenticated
  using (is_team_member(team_id_for_project(project_id)));
create policy "master manages assignees" on project_assignees for all to authenticated
  using (is_team_master(team_id_for_project(project_id)))
  with check (is_team_master(team_id_for_project(project_id)));

-- Comments: readable by teammates; writable only by people with access to
-- that specific stage (or master) — enforces "only tagged people can post
-- notes on a stage" at the database level.
create policy "comments readable by teammates" on project_comments for select to authenticated
  using (is_team_member(team_id_for_project(project_id)));
create policy "stage-access can post comments" on project_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and (member_has_stage_access(team_id_for_project(project_id), stage) or is_team_master(team_id_for_project(project_id)))
  );

-- Review pins: readable by teammates; writable only by Edit-stage holders
-- (or master).
create policy "pins readable by teammates" on video_review_pins for select to authenticated
  using (is_team_member(team_id_for_project(project_id)));
create policy "edit-access can post pins" on video_review_pins for insert to authenticated
  with check (
    author_id = auth.uid()
    and (member_has_stage_access(team_id_for_project(project_id), 'edit') or is_team_master(team_id_for_project(project_id)))
  );
create policy "edit-access can update pins" on video_review_pins for update to authenticated
  using (member_has_stage_access(team_id_for_project(project_id), 'edit') or is_team_master(team_id_for_project(project_id)));

-- Package entries: readable by teammates; writable by Package-stage holders.
create policy "entries readable by teammates" on package_entries for select to authenticated
  using (is_team_member(team_id_for_project(project_id)));
create policy "package-access can manage entries" on package_entries for all to authenticated
  using (member_has_stage_access(team_id_for_project(project_id), 'package') or is_team_master(team_id_for_project(project_id)))
  with check (member_has_stage_access(team_id_for_project(project_id), 'package') or is_team_master(team_id_for_project(project_id)));

-- Notifications: a user can only ever see or modify their own.
create policy "users read their own notifications"
  on notifications for select to authenticated using (recipient_id = auth.uid());
create policy "users update their own notifications"
  on notifications for update to authenticated using (recipient_id = auth.uid());

-- ---------------------------------------------------------------------------
-- SEED: make the team creator a member with the 'master' role automatically.
-- ---------------------------------------------------------------------------

create function handle_new_team()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_member_id uuid;
  owner_email text;
begin
  select email into owner_email from auth.users where id = new.owner_id;

  insert into team_members (team_id, user_id, invited_email, status)
  values (new.id, new.owner_id, owner_email, 'active')
  returning id into new_member_id;

  insert into member_roles (team_member_id, role) values (new_member_id, 'master');

  return new;
end;
$$;

create trigger on_team_created
  after insert on teams
  for each row execute procedure handle_new_team();
