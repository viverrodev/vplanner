"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { actorMeta, teamMeta, sendNotifications } from "@/lib/notify";
import { ROLES } from "@/lib/permissions/roles";

/**
 * The bell updates itself instantly on the client (optimistic), so these
 * don't re-render the page — they just persist the change.
 */
export async function markNotificationRead(id: string) {
  const supabase = await createClient();
  await supabase.from("notifications").update({ is_read: true }).eq("id", id);
}

export async function markAllNotificationsRead() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("recipient_id", user.id)
    .eq("is_read", false);
}

/** Roles an invite is allowed to grant — never Master, never unknown values. */
function sanitizeInviteRoles(roles: unknown): string[] {
  if (!Array.isArray(roles)) return [];
  return roles.filter(
    (r): r is string =>
      typeof r === "string" && r !== "master" && ROLES.some((role) => role.id === r)
  );
}

/**
 * Accept or decline a team invite.
 *
 * Why this is safe to do with the admin client: since migration 0022 the
 * invited person has NO update access to team_invites, so every value we
 * read from the invite (team_id, proposed_roles, status, expiry) is
 * exactly what the master created. Roles are re-sanitized anyway.
 *
 * The status flip happens FIRST, as a compare-and-swap on
 * status = 'pending', so double-clicking Accept (or two tabs) can't
 * process the same invite twice.
 */
export async function respondToTeamInvite(inviteId: string, accept: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("team_invites")
    .select("id, team_id, invited_user_id, invited_by, proposed_roles, status, expires_at")
    .eq("id", inviteId)
    .maybeSingle();

  if (!invite || invite.invited_user_id !== user.id) {
    return { error: "Invite not found." };
  }
  if (invite.status !== "pending") {
    return { error: "This invite has already been responded to." };
  }
  if (new Date(invite.expires_at) < new Date()) {
    await admin.from("team_invites").update({ status: "expired" }).eq("id", inviteId).eq("status", "pending");
    revalidatePath("/", "layout");
    return { error: "This invite has expired — ask them to send a new one." };
  }

  // Claim the invite atomically.
  const { data: claimed } = await admin
    .from("team_invites")
    .update({ status: accept ? "accepted" : "declined", responded_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (!claimed) {
    return { error: "This invite has already been responded to." };
  }

  if (accept) {
    const { data: existing } = await admin
      .from("team_members")
      .select("id")
      .eq("team_id", invite.team_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) {
      const { data: profile } = await admin
        .from("profiles")
        .select("email")
        .eq("id", user.id)
        .single();

      const { data: teamMember, error: memberError } = await admin
        .from("team_members")
        .insert({
          team_id: invite.team_id,
          user_id: user.id,
          invited_email: profile?.email ?? user.email ?? "",
          status: "active",
        })
        .select("id")
        .single();

      if (memberError || !teamMember) {
        console.error("[respondToTeamInvite] member insert:", memberError?.message);
        // Put the invite back so they can retry.
        await admin
          .from("team_invites")
          .update({ status: "pending", responded_at: null })
          .eq("id", inviteId);
        return { error: "Couldn't join the team — try again." };
      }

      const roles = sanitizeInviteRoles(invite.proposed_roles);
      if (roles.length > 0) {
        const { error: rolesError } = await admin
          .from("member_roles")
          .insert(roles.map((role) => ({ team_member_id: teamMember.id, role })));
        if (rolesError) {
          console.error("[respondToTeamInvite] roles insert:", rolesError.message);
        }
      }
    }
  }

  // Let the inviter know how it went.
  if (invite.invited_by) {
    const [actor, team] = await Promise.all([
      actorMeta(admin, user.id),
      teamMeta(admin, invite.team_id),
    ]);
    await sendNotifications({
      recipient_id: invite.invited_by,
      kind: "team_invite_response",
      metadata: { actor, team, accepted: accept },
      body: accept
        ? `${actor.name} accepted your invite and joined ${team.name}.`
        : `${actor.name} declined your invite to ${team.name}.`,
    });
  }

  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Accept or decline a request to take over ownership of a team.
 *
 * Same safety model as invites: the recipient can't edit the request
 * row (0022), and on top of that we re-check at accept time that the
 * SENDER is still the team's owner — the owner_id update itself is a
 * compare-and-swap on that, so a stale or tampered request can never
 * move ownership of a team the sender doesn't own.
 */
export async function respondToOwnershipTransfer(requestId: string, accept: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  const admin = createAdminClient();

  const { data: request } = await admin
    .from("ownership_transfer_requests")
    .select("id, team_id, from_user_id, to_user_id, status, expires_at")
    .eq("id", requestId)
    .maybeSingle();

  if (!request || request.to_user_id !== user.id) {
    return { error: "Request not found." };
  }
  if (request.status !== "pending") {
    return { error: "This request has already been responded to." };
  }
  if (new Date(request.expires_at) < new Date()) {
    await admin
      .from("ownership_transfer_requests")
      .update({ status: "expired" })
      .eq("id", requestId)
      .eq("status", "pending");
    revalidatePath("/", "layout");
    return { error: "This request has expired." };
  }

  if (accept) {
    const [{ data: team }, { data: targetMember }] = await Promise.all([
      admin.from("teams").select("owner_id").eq("id", request.team_id).maybeSingle(),
      admin
        .from("team_members")
        .select("id")
        .eq("team_id", request.team_id)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle(),
    ]);

    if (!team || team.owner_id !== request.from_user_id) {
      await admin.from("ownership_transfer_requests").update({ status: "expired" }).eq("id", requestId);
      revalidatePath("/", "layout");
      return { error: "This request is no longer valid — the team's ownership has changed." };
    }
    if (!targetMember) {
      return { error: "You're no longer an active member of this team." };
    }
  }

  const { data: claimed } = await admin
    .from("ownership_transfer_requests")
    .update({ status: accept ? "accepted" : "declined", responded_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (!claimed) {
    return { error: "This request has already been responded to." };
  }

  if (accept) {
    const { data: moved, error: teamError } = await admin
      .from("teams")
      .update({ owner_id: user.id })
      .eq("id", request.team_id)
      .eq("owner_id", request.from_user_id)
      .select("id")
      .maybeSingle();

    if (teamError || !moved) {
      await admin
        .from("ownership_transfer_requests")
        .update({ status: "pending", responded_at: null })
        .eq("id", requestId);
      return { error: "Couldn't complete the transfer — try again." };
    }

    const { data: targetMember } = await admin
      .from("team_members")
      .select("id")
      .eq("team_id", request.team_id)
      .eq("user_id", user.id)
      .single();

    if (targetMember) {
      await admin
        .from("member_roles")
        .upsert({ team_member_id: targetMember.id, role: "master" }, { onConflict: "team_member_id,role" });
    }
  }

  const [actor, team] = await Promise.all([
    actorMeta(admin, user.id),
    teamMeta(admin, request.team_id),
  ]);
  await sendNotifications({
    recipient_id: request.from_user_id,
    kind: "ownership_response",
    metadata: { actor, team, accepted: accept },
    body: accept
      ? `${actor.name} accepted ownership of ${team.name}.`
      : `${actor.name} declined ownership of ${team.name}.`,
  });

  revalidatePath("/", "layout");
  return { success: true };
}
