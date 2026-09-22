-- ============================================================================
-- 0003: track last-editor on projects, for inline-edit timestamps
-- ============================================================================

alter table long_video_projects
  add column if not exists updated_by uuid references profiles(id);
