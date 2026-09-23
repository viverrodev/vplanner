-- ============================================================================
-- 0016: invite expiry + ability to resend
--
-- Pending invites now expire after 1 hour. The unique-pending-invite
-- index stays as-is (still correctly blocks a duplicate invite while
-- one is genuinely still live) — what changes is that sending a new
-- invite first quietly expires any of the recipient's own stale
-- pending invites for this team, so a new one can go out. A Postgres
-- partial index predicate can't reference now() (it isn't immutable),
-- which is why this is handled as a cleanup step at invite-time in the
-- application, not as a smarter index.
-- ============================================================================

alter type invite_status add value if not exists 'expired';

alter table team_invites add column if not exists expires_at timestamptz not null default (now() + interval '1 hour');
