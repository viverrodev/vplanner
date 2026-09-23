-- ============================================================================
-- 0017: real-time notifications
--
-- Same mechanism already used for chat (0009) — without this, Supabase
-- Realtime has no way to know this table should stream changes at all,
-- regardless of any client-side subscription code.
-- ============================================================================

alter publication supabase_realtime add table notifications;
