-- ============================================================================
-- 0013: team invites — decoupled from account creation
--
-- Account creation now happens ONLY via the Supabase dashboard (invite
-- link), done personally by the project owner. This table is for the
-- separate, lighter-weight thing: inviting an EXISTING account to join
-- a specific team, which shows up as a real notification the person can
-- accept or decline.
-- ============================================================================

create type invite_status as enum ('pending', 'accepted', 'declined');

create table team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  invited_user_id uuid not null references profiles(id) on delete cascade,
  invited_by uuid not null references profiles(id),
  proposed_roles role_type[] not null default '{}',
  status invite_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

-- Only one live (pending) invite per person per team at a time.
create unique index team_invites_one_pending
  on team_invites (team_id, invited_user_id)
  where status = 'pending';

alter table team_invites enable row level security;

create policy "invited user can see their own invites"
  on team_invites for select to authenticated
  using (invited_user_id = auth.uid() or is_team_master(team_id));

create policy "master can create invites"
  on team_invites for insert to authenticated
  with check (is_team_master(team_id) and invited_by = auth.uid());

create policy "invited user can respond to their own invite"
  on team_invites for update to authenticated
  using (invited_user_id = auth.uid())
  with check (invited_user_id = auth.uid());

create policy "master can cancel a pending invite"
  on team_invites for delete to authenticated
  using (is_team_master(team_id));

-- Link notifications to the invite that spawned them, so the bell can
-- render Accept/Decline directly instead of just a text notification.
alter table notifications add column if not exists team_invite_id uuid references team_invites(id) on delete cascade;

-- The existing team_members/member_roles insert policies are master-only
-- (see 0001) — which would silently block the exact thing this feature
-- needs: a normal, non-master person accepting their own invite and
-- creating their own membership row. These add that one specific,
-- narrow exception.
create policy "invited user can join by accepting their own invite"
  on team_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from team_invites ti
      where ti.team_id = team_members.team_id
        and ti.invited_user_id = auth.uid()
        and ti.status = 'pending'
    )
  );

create policy "invited user can accept their proposed roles"
  on member_roles for insert to authenticated
  with check (
    exists (
      select 1 from team_members tm
      join team_invites ti
        on ti.team_id = tm.team_id and ti.invited_user_id = tm.user_id
      where tm.id = member_roles.team_member_id
        and tm.user_id = auth.uid()
        and ti.status = 'pending'
    )
  );
