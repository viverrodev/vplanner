import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster, ROLES } from "@/lib/permissions/roles";
import type { RoleId } from "@/lib/permissions/roles";
import { getRoleColors } from "@/lib/permissions/team-role-colors";
import { colorForId, displayName, initialsFor } from "@/lib/avatar";
import { getCachedUser } from "@/lib/supabase/get-user";
import { TeamLogoUploader } from "./team-logo-uploader";
import { TeamNameEditor } from "./team-name-editor";
import { InviteSearch } from "./invite-search";
import { PendingInvitesList } from "./pending-invites-list";
import { MemberManager, type MemberRow } from "./member-manager";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Team" };
import { RoleColorPicker } from "./role-color-picker";
import { TransferOwnership } from "./transfer-ownership";
import { DeleteTeamButton } from "./delete-team-button";
import { YouTubeIcon, TikTokIcon, InstagramIcon, FacebookIcon } from "@/components/ui/platform-icons";

const PLATFORMS = [
  { id: "youtube", name: "YouTube" },
  { id: "tiktok", name: "TikTok" },
  { id: "meta", name: "Instagram & Facebook" },
] as const;

export default async function TeamPage() {
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);

  if (!currentTeam) {
    return <div className="p-8 text-sm text-ink-soft">Create a team first.</div>;
  }

  const [membership, currentUser, roleColors, [{ data: team }, { data: members }, { data: connections }, { data: pendingInvites }]] = await Promise.all([
    getMembership(supabase, currentTeam.id),
    getCachedUser(),
    getRoleColors(supabase, currentTeam.id),
    Promise.all([
    supabase.from("teams").select("id, name, logo_url, color, owner_id").eq("id", currentTeam.id).single(),
    supabase
      .from("team_members")
      .select("id, user_id, invited_email, status, profiles(username, full_name, email, avatar_url), member_roles(role)")
      .eq("team_id", currentTeam.id)
      .order("created_at"),
    supabase.from("connected_accounts").select("platform, status, account_label").eq("team_id", currentTeam.id),
    supabase
      .from("team_invites")
      .select("id, proposed_roles, expires_at, created_at, profiles!team_invites_invited_user_id_fkey(username, full_name, email)")
      .eq("team_id", currentTeam.id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    ]),
  ]);
  const userIsMaster = isMaster(membership?.roles ?? []);
  const viewerIsOwner = !!currentUser && currentUser.id === team?.owner_id;

  // The owner's live (pending, unexpired) ownership request, if any —
  // so it can be shown and canceled.
  const { data: pendingTransferRow } = viewerIsOwner
    ? await supabase
        .from("ownership_transfer_requests")
        .select("id, to_user_id, expires_at")
        .eq("team_id", currentTeam.id)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .maybeSingle()
    : { data: null };

  const memberRows: MemberRow[] = (members ?? []).map((m) => {
    const profile = m.profiles as unknown as { username: string | null; full_name: string | null; email: string | null; avatar_url: string | null } | null;
    const email = profile?.email ?? m.invited_email;
    return {
      teamMemberId: m.id,
      userId: m.user_id,
      username: profile?.username ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      name: displayName(profile?.username, profile?.full_name, email),
      email,
      status: m.status as "invited" | "active",
      roles: (m.member_roles ?? []).map((r: { role: RoleId }) => r.role),
      isOwner: m.user_id === team?.owner_id,
      color: m.user_id ? colorForId(m.user_id) : "#999",
    };
  });

  const connectionByPlatform = new Map((connections ?? []).map((c) => [c.platform, c]));

  return (
    <div className="px-4 sm:px-10 py-5 sm:py-9 w-full max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold mb-1">Team settings</h1>
        <p className="text-sm text-ink-soft">Manage {currentTeam.name} and who&rsquo;s in it.</p>
      </div>

      {/* Workspace branding */}
      <section className="rounded-xl border border-line/10 bg-surface p-6">
        <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-4">
          Workspace
        </h2>
        <div className="mb-4">
          <TeamNameEditor teamId={currentTeam.id} name={team?.name ?? currentTeam.name} />
        </div>
        {userIsMaster ? (
          <TeamLogoUploader
            teamId={currentTeam.id}
            logoUrl={team?.logo_url ?? null}
            initials={initialsFor(currentTeam.name)}
            color={team?.color ?? "#E8630D"}
          />
        ) : (
          <p className="text-[12.5px] text-ink-faint">Only the master can change workspace branding.</p>
        )}
      </section>

      {/* Members */}
      <section className="rounded-xl border border-line/10 bg-surface p-6">
        <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-4">
          Members ({memberRows.length})
        </h2>
        <div>
          {memberRows.map((m) =>
            userIsMaster ? (
              <MemberManager
                key={m.teamMemberId}
                teamId={currentTeam.id}
                member={m}
                roleColors={roleColors}
                isSelf={m.userId === currentUser?.id}
                viewerIsOwner={viewerIsOwner}
              />
            ) : (
              <div key={m.teamMemberId} className="flex items-center gap-3 py-3 border-b border-line/10 last:border-none flex-wrap">
                {m.username ? (
                  <a href={`/u/${m.username}`} className="flex-shrink-0">
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white overflow-hidden hover:opacity-80 transition-opacity"
                      style={{ background: m.color }}
                    >
                      {m.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img loading="lazy" decoding="async" src={m.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        initialsFor(m.name)
                      )}
                    </span>
                  </a>
                ) : (
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 overflow-hidden"
                    style={{ background: m.color }}
                  >
                    {m.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img loading="lazy" decoding="async" src={m.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      initialsFor(m.name)
                    )}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold flex items-center gap-1.5">
                    {m.name}
                    {m.isOwner && <span className="text-amber text-[11px]">★ Owner</span>}
                  </div>
                  <div className="text-[11.5px] text-ink-faint">{m.email}</div>
                </div>
                <div className="flex flex-wrap gap-1 w-full sm:w-auto">
                  {m.roles.length === 0 ? (
                    <span className="text-[10.5px] text-ink-faint">No roles</span>
                  ) : (
                    m.roles.map((r) => {
                      const c = roleColors[r] ?? "#999";
                      const roleName = ROLES.find((role) => role.id === r)?.name ?? r;
                      return (
                        <span
                          key={r}
                          className="text-[10.5px] font-bold px-2 py-0.5 rounded-full"
                          style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}
                        >
                          {roleName}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>
            )
          )}
        </div>

        {userIsMaster && (
          <div className="mt-5 pt-5 border-t border-line/10">
            <h3 className="text-[12px] font-bold text-ink-soft mb-3">Invite to this team</h3>
            <PendingInvitesList
              teamId={currentTeam.id}
              invites={(pendingInvites ?? []).map((inv) => {
                const p = inv.profiles as unknown as {
                  username: string | null;
                  full_name: string | null;
                  email: string | null;
                } | null;
                return {
                  id: inv.id,
                  name: displayName(p?.username, p?.full_name, p?.email),
                  proposedRoles: (inv.proposed_roles ?? []) as RoleId[],
                  expiresAt: inv.expires_at,
                };
              })}
            />
            <InviteSearch teamId={currentTeam.id} />
          </div>
        )}
      </section>

      {/* Role colors */}
      <section className="rounded-xl border border-line/10 bg-surface p-6">
        <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-1">
          Role colors
        </h2>
        <p className="text-[12px] text-ink-soft mb-4">
          Used for role badges, @mentions, and everywhere a role shows up.
        </p>
        {userIsMaster ? (
          <RoleColorPicker teamId={currentTeam.id} roleColors={roleColors} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {ROLES.map((r) => (
              <div key={r.id} className="flex items-center gap-2.5 rounded-lg border border-line/10 px-3 py-2.5">
                <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: roleColors[r.id] }} />
                <span className="text-[12.5px] font-semibold">{r.name}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Social connections */}
      <section className="rounded-xl border border-line/10 bg-surface p-6">
        <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-1">
          Connected accounts
        </h2>
        <p className="text-[12px] text-ink-soft mb-4">
          For publishing directly from VPlanner later. Each of these needs a
          developer app registered with that platform before a real
          &ldquo;Connect&rdquo; button can work — not something we can turn
          on from inside the app alone. Flagging honestly rather than faking
          a working button.
        </p>
        <div className="space-y-2">
          {PLATFORMS.map((p) => {
            const conn = connectionByPlatform.get(p.id);
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-lg border border-line/10 px-3.5 py-3"
              >
                <span className="flex items-center gap-1 flex-shrink-0">
                  {p.id === "youtube" && <YouTubeIcon className="w-8 h-8" />}
                  {p.id === "tiktok" && <TikTokIcon className="w-8 h-8" />}
                  {p.id === "meta" && (
                    <>
                      <InstagramIcon className="w-8 h-8" />
                      <FacebookIcon className="w-8 h-8" />
                    </>
                  )}
                </span>
                <span className="text-[13px] font-semibold flex-1">{p.name}</span>
                <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint bg-surface-2 px-2 py-1 rounded-full">
                  {conn?.status === "connected" ? conn.account_label ?? "Connected" : "Not connected"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {currentUser?.id === team?.owner_id && (
        <section className="rounded-xl border border-red/20 bg-red/5 p-6">
          <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-red mb-1">
            Transfer ownership
          </h2>
          <p className="text-[12px] text-ink-soft mb-4">
            Send someone a request to become this team&rsquo;s owner. Nothing
            changes until they accept — you stay the owner until then.
          </p>
          <TransferOwnership
            teamId={currentTeam.id}
            pendingTransfer={
              pendingTransferRow
                ? {
                    name:
                      memberRows.find((m) => m.userId === pendingTransferRow.to_user_id)?.name ??
                      "a teammate",
                    expiresAt: pendingTransferRow.expires_at,
                  }
                : null
            }
            candidates={memberRows
              .filter((m) => m.userId && m.userId !== currentUser?.id && m.status === "active")
              .map((m) => ({ userId: m.userId as string, name: m.name, avatarUrl: m.avatarUrl }))}
          />

          <div className="mt-5 pt-5 border-t border-red/20">
            <h3 className="text-[12px] font-bold text-red mb-1">Delete team</h3>
            <p className="text-[12px] text-ink-soft mb-3">
              Permanent — every project, comment, and member goes with it.
            </p>
            <DeleteTeamButton
              teamId={currentTeam.id}
              teamName={currentTeam.name}
              connectedPlatforms={(connections ?? [])
                .filter((c) => c.status === "connected")
                .map((c) => c.platform)}
            />
          </div>
        </section>
      )}
    </div>
  );
}
