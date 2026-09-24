# VPlanner — Project Handoff

Internal content-production dashboard for a YouTube team. Stack: **Next.js 15 (App Router) + Supabase (Postgres + Auth + Storage + Realtime) + Vercel**. Repo on GitHub. Production URL: `https://vivplanner.vercel.app`.

## Infrastructure
- **Vercel**: one project, auto-deploys from `main`. Env vars scoped separately per environment (Production / Preview / Development) for: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (secret, server-only), `GIPHY_API_KEY` (secret), `NEXT_PUBLIC_SITE_URL`.
- **Supabase**: two *separate* projects — `vplanner-staging` and `vplanner-production`. Every migration must be run on **both**, independently. This has been a recurring source of bugs (schema drift between them) — always double-check which project you're looking at before running SQL or trusting a query result.
- **Email**: custom SMTP via Resend (`smtp.resend.com`) configured in Supabase Auth settings, using a verified domain (viverro.com). Sender: `invites@viverro.com`. This replaced Supabase's default email sender, which has a strict rate limit unsuitable for real use.
- **Account creation model**: accounts are created **only** via the Supabase dashboard directly (Authentication → Users → Invite user), done personally by the project owner — there is no in-app UI that can create a new account. This was a deliberate architecture decision: account creation and team membership are fully decoupled. Team membership is a separate, lighter-weight in-app request/accept flow (see below).

## Migration history (run in order, on both projects)
- **0001**: full initial schema — profiles, teams, team_members, member_roles, tags, member_tags, long_video_projects, project_titles, project_thumbnails, project_assignees, project_comments, video_review_pins, package_entries, notifications. Enums: `role_type`, `pipeline_stage`. RLS on everything. Helper functions: `is_team_member()`, `is_team_master()`, `member_has_stage_access()`, `role_allows_stage()`.
- 0002: profiles.email, thumbnail storage bucket
- 0003: long_video_projects.updated_by
- 0004: role_colors table
- 0005: comment deletion RLS
- 0006: teams.logo_url, notifications.stage, connected_accounts table, team-logos bucket
- 0007: connected_accounts unique index
- 0008: comment_attachments table + bucket
- 0009: realtime enabled on project_comments
- 0010: project deletion (RLS + app-level, with storage cleanup)
- 0011: user settings — username column, avatars bucket
- 0012: public profiles — teams_visible privacy flag, `get_visible_teams()` security-definer function
- 0013: team_invites table (decoupled from account creation) — **note: the original RLS policy here for accepting an invite had a real, hard-to-diagnose bug**, see 0018
- 0014: allow user deletion — several `ON DELETE` FKs to profiles had no cascade behavior specified, blocking account deletion entirely. Fixed to `SET NULL` (content survives; only the "who did this" link clears). Deliberately **not** applied to `teams.owner_id` — a team must always have a real owner.
- 0015: **critical fix** — `notifications` table had SELECT/UPDATE RLS policies since day one but was *missing an INSERT policy entirely*. Every notification-creating feature in the app (mentions, stage changes, invites, everything) had been silently failing at the database level. Fixed with an open `with check (true)` insert policy — the app's own server actions control who actually gets notified, not RLS.
- 0016: invite expiry (1 hour) + resend support
- 0017: realtime enabled on notifications
- 0018: **fixes the team_invites accept-flow RLS bug from 0013.** The original policy used an inline `EXISTS` subquery against `team_invites` (itself RLS-protected) inside another table's `WITH CHECK` clause — this produced "new row violates row-level security policy" on a genuinely valid accept, confirmed via extensive direct-SQL diagnosis (the policy logic, the data, and `auth.uid()` all checked out correct in isolation; the real request still failed). Switched to a `SECURITY DEFINER` helper function (`has_pending_invite()`), the same proven pattern already used by `is_team_master`.
- 0019: temporary debug function (`get_auth_uid_debug`) used during the above diagnosis — harmless, still in schema, never cleaned up
- 0020: ownership transfer as a request/accept flow (mirrors team_invites exactly) — `ownership_transfer_requests` table
- 0021: structured notifications — added `kind` (discriminator) and `metadata` (jsonb) columns to notifications, so the bell can render real avatars, bold names, and colored role pills instead of plain text. `body` stays as a fallback.

- 0022: **security hardening** (post-audit). Removed user UPDATE access on team_invites / ownership_transfer_requests (invitees could previously rewrite team_id/proposed_roles and join any team as Master); dropped the 0018 self-join policies + `has_pending_invite()`; users can no longer INSERT notifications (server-only now); column-level grants on profiles (no email edits), teams (name/logo/color only; any Master may edit them), notifications (is_read only); triggers: only a Master changes a project's stage, projects can't change team/creator, owner can't be kicked and is always Master, only the OWNER grants/removes Master; assignees must be active same-team members with a role covering the stage; comment attachments must be in the project's folder or a Giphy URL; fixed FKs that blocked account deletion (updated_by, ownership request users); `team_invites_no_master` check; dropped `get_auth_uid_debug()`.

- 0023: **performance** — indexes on every filtered/joined/sorted column (FKs weren't indexed); SELECT policies rewritten to set-based helpers (`my_team_ids()`, `my_project_ids()`, `my_master_team_ids()`, `my_teammate_member_ids()`, all SECURITY DEFINER) evaluated once per query instead of per row; `FOR ALL` master policies split into insert/update/delete. Permissions unchanged (verified with the local test suite).

- 0024: **global search** — `pg_trgm` (in the `extensions` schema) + trigram GIN indexes on profile usernames/names, project titles, alternate titles and team names; `global_search(q, max_results)` RPC is SECURITY INVOKER (RLS decides what's findable), returns `{people, projects, teams, master_teams}` in one call. People carry `member_of`/`invited_to` (only for teams the searcher masters) for the Invite flow. Email only matches when the query contains "@" and is never returned.

## Key architectural patterns (apply these consistently going forward)
- **The admin-client pattern**: `createAdminClient()` (service role, bypasses RLS, `server-only`) is used only in server actions, only after verifying the caller, and **only with values the user could not have edited** — e.g. invite/transfer rows (users have no UPDATE on those since 0022), the verified user id, constants. Accept flows claim the row atomically (`update ... where status = 'pending'`). The original 0013 "RLS bug" was most likely the insert-then-`.select()` gotcha (the returned row must pass the SELECT policy, and `is_team_member()` can't see a row inserted in the same statement), not a session problem.
- **Privileged project actions derive the team from the project row** (`requireProjectMaster` in `videos/[id]/actions.ts`), never from a teamId sent by the browser.
- **Notifications are created only via `sendNotifications()`** in `lib/notify.ts` (admin client).
- **Structured notifications**: every notification-creating action populates `kind` + `metadata` (actor name/avatar, team name/logo/color, role names/colors, project/stage info) via shared helpers in `lib/notify.ts` (`actorMeta()`, `teamMeta()`). `NotificationBell` renders each kind distinctly.
- **`displayName(username, fullName, email)`** in `lib/avatar.ts` is the canonical way to get a person's display name — username first, then full name, then email prefix. Always pass all three in that order.
- **Decoupled invites**: `team_invites` (join a team) and `ownership_transfer_requests` (become the owner) are both request/accept-notification flows with 1-hour expiry, cancelable by the sender, and both notify the *sender* of the outcome too (accept or decline), not just the recipient.
- Middleware sets `Cache-Control: private, no-store` on every response — a documented Supabase/Vercel gotcha where a cached auth response can cause "works, then goes stale until re-login." Dashboard layout also has `export const dynamic = "force-dynamic"`.
- `AuthHashHandler` (mounted in root layout) catches `#access_token=` hash-fragment redirects (used by dashboard-triggered invites and password-reset links, which can't use the app's own `?code=` callback route since they're not triggered by app code) — explicitly parses the token and calls `setSession()` directly rather than relying on the Supabase client's automatic hash-detection, which didn't reliably fire for `type=invite` links in testing.

- **Performance conventions** are documented in the README ("Performance conventions") — parallel `Promise.all` queries, `cache()`d loaders, `getCachedUser()` reads the identity middleware already verified (sanitized `x-vp-verified-user-*` request headers), `useAction()` + `useOptimistic` for instant UI, realtime patches rows instead of refreshing pages, `loading.tsx` skeletons on every route, `compressImage()` before every upload.
- The project page takes its team from `project.team_id` (via cached `getProject()`), not the workspace switcher.

## Known loose ends
- All previous loose ends resolved (prod invite accept confirmed working, diagnostic error reverted, debug function dropped, `0000_testing_commands.sql` is the owner's personal scratch file → lives in gitignored `supabase/scratch/`).
- `types/database.ts` is still `any` — generate real types (planned alongside Supabase CLI setup).
- Manual per-project migration running is the root cause of schema drift — planned move to Supabase CLI `db push`.

## Current roadmap
- ✅ Part 1: performance foundation (0023 + app-wide patterns)
- ✅ Part 2: UI/mobile polish — 404 (in-shell via `(dashboard)/[...missing]` catch-all + root fallback), `team_disbanded` notification, profiles linkable for everyone (`/u/<username>` or `/u/<user-id>`, `profileHref()`), `RolePills` (max 2 + "+N"), state-based stage colors (`stageState()` / `STAGE_STATE_COLOR`: orange current, teal done, neutral upcoming), neutral filter chips with counts, SVG icon set (never Unicode symbols for UI chrome — iOS renders them as emoji), notifications panel rendered in a portal (the header's backdrop-blur was trapping `position: fixed`), bottom nav with safe-area padding
- ✅ Part 3: global search — `components/search/*`: header trigger (desktop bar / mobile icon), Ctrl/⌘+K and "/" shortcuts, ↑↓/Enter/Esc, Tab or → on a person opens the Invite panel (team picker with member/pending states, roles via 1–6, Enter sends via `inviteExistingUser`), full-screen sheet on phones, recents (localStorage per user), quick actions + switch team, match highlighting, thumbnails/team badges/stage pills; browser calls the RPC directly (debounced, cached, out-of-order safe)
- ⏭ Next: social account connections (own focused phase — YouTube first)

## Open phases / discussed but not yet built
- **Research stage build-out** (and the rest of the pipeline past Ideate) — the actual production workflow (Research → Script → Film → Edit → Package → Publish) is still just placeholder assignee/notes tabs, not fully designed like Ideate.
- **Optimistic UI** — actions currently wait for a full server round-trip; discussed doing a real pass on this, not started.
- **Social OAuth** (YouTube/TikTok/Meta) — blocked on registering developer apps with each platform.
- **Global search bar** ("Roblox-style" — search a person, see results across accounts/videos/etc.) — explicitly deferred until the account/team decoupling (now done) made it feasible.
- **Dashboard to-do widget** — user wants a quick-glance "things assigned to me" widget on the main dashboard eventually; nothing built yet, just noted for later.

## What to upload in the new conversation
Upload the **most recent zip** you have from this conversation (the production service-role-key fix didn't require a new zip — the last real code delivery was `vplanner-part3-search.zip`). If you've made any manual edits since then (like deleting the old `invite-form.tsx` or similar), make sure those are reflected in what you upload, or just say so.

Paste this whole document as your first message, then attach that zip.
