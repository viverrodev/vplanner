-- ============================================================================
-- 0004: per-team role colors
--
-- Every role ships with a sensible default color (see defaultRoleColor in
-- lib/permissions/roles.ts). This table lets a team's master override
-- those defaults — e.g. making Scripter blue for their team specifically.
-- No row here for a given role just means "use the default."
-- ============================================================================

create table role_colors (
  team_id uuid not null references teams(id) on delete cascade,
  role role_type not null,
  color text not null,
  primary key (team_id, role)
);

alter table role_colors enable row level security;

create policy "role colors readable by teammates"
  on role_colors for select to authenticated
  using (is_team_member(team_id));

create policy "master manages role colors"
  on role_colors for all to authenticated
  using (is_team_master(team_id))
  with check (is_team_master(team_id));
