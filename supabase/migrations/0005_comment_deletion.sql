-- ============================================================================
-- 0005: comment deletion
-- ============================================================================

create policy "author or master can delete comments"
  on project_comments for delete to authenticated
  using (
    author_id = auth.uid()
    or is_team_master(team_id_for_project(project_id))
  );
