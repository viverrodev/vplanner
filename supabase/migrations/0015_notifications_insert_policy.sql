-- ============================================================================
-- 0015: fix missing notifications INSERT policy
--
-- notifications has always had SELECT/UPDATE policies (a user can only
-- read/mark-read their own), but never an INSERT policy — meaning every
-- notification insert in the app, across every feature (stage changes,
-- @mentions, assignments, team invites, ownership transfers), has been
-- silently rejected by RLS this whole time. The action code never
-- checked the error, so nothing ever surfaced the failure.
--
-- The right model here: any authenticated user can create a
-- notification for ANY recipient. That's intentional, not a security
-- hole — who actually gets notified about what is entirely decided by
-- the app's own server actions (you can only trigger a notification
-- through a real feature, like mentioning someone or sending an
-- invite), not by this policy. SELECT stays locked to the recipient,
-- which is what actually protects the data.
-- ============================================================================

create policy "authenticated users can create notifications"
  on notifications for insert to authenticated
  with check (true);
