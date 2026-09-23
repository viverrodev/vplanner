-- ============================================================================
-- 0021: structured notifications
--
-- Notifications were plain text strings baked in at creation time,
-- which made rich rendering (avatars, bold names, colored role pills)
-- impossible without fragile text-parsing. This adds a `kind`
-- discriminator and a `metadata` jsonb payload — each notification-
-- creating action now supplies real data (actor name/avatar, team
-- name/logo/color, role names/colors) instead of a flat sentence, and
-- the bell renders each kind distinctly. `body` stays as a fallback for
-- any notification that doesn't set metadata (old rows, or anything
-- simple), so nothing breaks.
-- ============================================================================

alter table notifications add column if not exists kind text;
alter table notifications add column if not exists metadata jsonb not null default '{}'::jsonb;
