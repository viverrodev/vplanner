-- ============================================================================
-- 0018: fix invite-acceptance RLS
--
-- The previous policies checked for a pending invite via an inline
-- EXISTS subquery directly against team_invites — which itself has RLS
-- enabled. That combination was producing "new row violates row-level
-- security policy" on a genuinely valid accept. Rather than keep
-- debugging exactly why that layering misbehaved, this switches to a
-- SECURITY DEFINER helper function (the same proven pattern already
-- used by is_team_master/is_team_member throughout this schema), which
-- checks the invite with its own elevated privileges instead of
-- depending on the RLS visibility of team_invites from inside another
-- policy's WITH CHECK clause.
-- ============================================================================

create or replace function has_pending_invite(p_team_id uuid, p_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from team_invites
    where team_id = p_team_id
      and invited_user_id = p_user_id
      and status = 'pending'
  );
$$;

drop policy if exists "invited user can join by accepting their own invite" on team_members;
create policy "invited user can join by accepting their own invite"
  on team_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and has_pending_invite(team_id, auth.uid())
  );

drop policy if exists "invited user can accept their proposed roles" on member_roles;
create policy "invited user can accept their proposed roles"
  on member_roles for insert to authenticated
  with check (
    exists (
      select 1 from team_members tm
      where tm.id = member_roles.team_member_id
        and tm.user_id = auth.uid()
        and has_pending_invite(tm.team_id, auth.uid())
    )
  );
