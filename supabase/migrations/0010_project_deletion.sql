-- ============================================================================
-- 0010: project deletion
-- ============================================================================

create policy "master can delete projects"
  on long_video_projects for delete to authenticated
  using (is_team_master(team_id));
