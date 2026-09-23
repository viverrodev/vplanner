-- ============================================================================
-- 0012: public profile pages — team visibility privacy setting
--
-- teams_visible controls whether people OUTSIDE your teams can see which
-- teams you belong to on your profile page. Your actual teammates can
-- always see it regardless (they already know — they're on the team
-- with you), which is what the function below implements: if the
-- profile owner has opted in, everyone sees their team list; if not,
-- only people who genuinely share a team with them do.
-- ============================================================================

alter table profiles add column if not exists teams_visible boolean not null default true;

create or replace function get_visible_teams(target_user_id uuid)
returns table (id uuid, name text, color text, logo_url text)
language sql
security definer set search_path = public
stable
as $$
  select t.id, t.name, t.color, t.logo_url
  from teams t
  join team_members tm on tm.team_id = t.id
  join profiles p on p.id = target_user_id
  where tm.user_id = target_user_id
    and tm.status = 'active'
    and (
      p.teams_visible = true
      or target_user_id = auth.uid()
      or exists (
        select 1 from team_members my
        where my.user_id = auth.uid()
          and my.team_id = t.id
          and my.status = 'active'
      )
    );
$$;
