-- ============================================================================
-- 0009: real-time comments
--
-- Enables Supabase Realtime's Postgres Changes feed on project_comments.
-- Comment attachments don't need their own subscription — an attachment
-- never exists without an accompanying comment insert, so listening to
-- project_comments alone is enough to catch both together.
-- ============================================================================

alter publication supabase_realtime add table project_comments;
