-- ============================================================================
-- 0025: anyone on the team can post notes in IDEATE
--
-- Ideate is the brainstorming stage, so every teammate can chat there.
-- All other stages keep the existing rule: only people with a role for
-- that stage (or a Master) can post.
-- ============================================================================

drop policy if exists "stage-access can post comments" on project_comments;
create policy "stage-access can post comments"
  on project_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      (stage = 'ideate' and project_id in (select my_project_ids()))
      or member_has_stage_access(team_id_for_project(project_id), stage)
      or is_team_master(team_id_for_project(project_id))
    )
  );
