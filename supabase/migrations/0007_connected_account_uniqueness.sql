-- ============================================================================
-- 0007: prevent the same external account linking to two workspaces
--
-- platform_account_id will hold the platform's own unique id for the
-- connected channel/page (e.g. a YouTube channel id) once real OAuth is
-- wired up. The unique constraint is GLOBAL (not per-team) on purpose —
-- that's what actually stops the same YouTube channel from being
-- connected to two different VPlanner workspaces at once.
-- ============================================================================

alter table connected_accounts
  add column if not exists platform_account_id text;

create unique index if not exists connected_accounts_platform_account_unique
  on connected_accounts (platform, platform_account_id)
  where platform_account_id is not null;
