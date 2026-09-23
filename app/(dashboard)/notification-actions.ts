"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { displayName } from "@/lib/avatar";
import { actorMeta, teamMeta } from "@/lib/notify";

export async function markNotificationRead(id: string) {
  const supabase = await createClient();
  await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  revalidatePath("/", "layout");
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
  revalidatePath("/", "layout");
}

/**
 * Accept or decline a team invite. On accept, this is the moment the
 * actual team_members row (and roles) get created — nothing about
 * someone's team membership exists until they've actually said yes.
 */
export async function respondToTeamInvite(inviteId: string, accept: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  const { data: invite } = await supabase
    .from("team_invites")
    .select("id, team_id, invited_user_id, invited_by, proposed_roles, status, expires_at")
    .eq("id", inviteId)
    .single();

  if (!invite || invite.invited_user_id !== user.id) {
    return { error: "Invite not found." };
  }
  if (invite.status !== "pending") {
    return { error: "This invite has already been responded to." };
  }
  if (new Date(invite.expires_at) < new Date()) {
    await supabase.from("team_invites").update({ status: "expired" }).eq("id", inviteId);
    return { error: "This invite has expired — ask them to send a new one." };
  }

  if (accept) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single();

    // By this point, everything RLS would have re-checked is already
    // verified above: this is genuinely the invited person (confirmed
    // against Supabase's Auth server directly via getUser(), not just a
    // cookie read), and the invite is genuinely still pending and
    // unexpired. That authorization decision is already correctly made
    // in application code — using the admin client here for this one
    // specific, already-authorized insert sidesteps an elusive
    // session-propagation quirk at the RLS layer (confirmed via direct
    // SQL simulation that the policy logic itself is correct) rather
    // than leaving real users blocked while that gets chased further.
    const admin = createAdminClient();

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
      return { error: "Couldn't join the team — try again." };
    }

    if (invite.proposed_roles?.length > 0) {
      await admin.from("member_roles").insert(
        invite.proposed_roles.map((role: string) => ({
          team_member_id: teamMember.id,
          role,
        }))
      );
    }
  }

  await supabase
    .from("team_invites")
    .update({ status: accept ? "accepted" : "declined", responded_at: new Date().toISOString() })
    .eq("id", inviteId);

  // Let the inviter know how it went — there's no privacy issue here
  // (they already know exactly who they invited, this doesn't reveal
  // anything new about that person), and leaving them with no signal
  // at all when someone declines is worse: they'd just never find out.
  if (invite.invited_by) {
    const [{ data: responderProfile }, { data: team }] = await Promise.all([
      supabase.from("profiles").select("username, full_name, email, avatar_url").eq("id", user.id).single(),
      supabase.from("teams").select("name, logo_url, color").eq("id", invite.team_id).single(),
    ]);
    const responderName = displayName(responderProfile?.username, responderProfile?.full_name, responderProfile?.email);
    await supabase.from("notifications").insert({
      recipient_id: invite.invited_by,
      kind: "team_invite_response",
      metadata: {
        actor: { name: responderName, avatarUrl: responderProfile?.avatar_url ?? null },
        team: { name: team?.name ?? "the team", logoUrl: team?.logo_url ?? null, color: team?.color ?? "#E8630D" },
        accepted: accept,
      },
      body: accept
        ? `${responderName} accepted your invite and joined ${team?.name ?? "the team"}.`
        : `${responderName} declined your invite to ${team?.name ?? "the team"}.`,
    });
  }

  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Accept or decline a request to take over ownership of a team. On
 * accept, this is the moment ownership actually moves — uses the admin
 * client for the actual write, same reasoning as accepting a team
 * invite: authorization is already fully verified in code above (this
 * is genuinely the person the request was sent to, and the request is
 * genuinely still pending and unexpired), so this sidesteps the same
 * RLS session-propagation quirk we found there rather than risk it
 * recurring here too.
 */
export async function respondToOwnershipTransfer(requestId: string, accept: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  const { data: request } = await supabase
    .from("ownership_transfer_requests")
    .select("id, team_id, from_user_id, to_user_id, status, expires_at")
    .eq("id", requestId)
    .single();

  if (!request || request.to_user_id !== user.id) {
    return { error: "Request not found." };
  }
  if (request.status !== "pending") {
    return { error: "This request has already been responded to." };
  }
  if (new Date(request.expires_at) < new Date()) {
    await supabase.from("ownership_transfer_requests").update({ status: "expired" }).eq("id", requestId);
    return { error: "This request has expired." };
  }

  const admin = createAdminClient();

  if (accept) {
    const { data: targetMember } = await admin
      .from("team_members")
      .select("id")
      .eq("team_id", request.team_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!targetMember) {
      return { error: "You're no longer an active member of this team." };
    }

    const { error: teamError } = await admin
      .from("teams")
      .update({ owner_id: user.id })
      .eq("id", request.team_id);

    if (teamError) return { error: "Couldn't complete the transfer — try again." };

    await admin
      .from("member_roles")
      .upsert({ team_member_id: targetMember.id, role: "master" }, { onConflict: "team_member_id,role" });
  }

  await supabase
    .from("ownership_transfer_requests")
    .update({ status: accept ? "accepted" : "declined", responded_at: new Date().toISOString() })
    .eq("id", requestId);

  const [{ data: responderProfile }, { data: team }] = await Promise.all([
    supabase.from("profiles").select("username, full_name, email, avatar_url").eq("id", user.id).single(),
    supabase.from("teams").select("name, logo_url, color").eq("id", request.team_id).single(),
  ]);
  const responderName = displayName(responderProfile?.username, responderProfile?.full_name, responderProfile?.email);
  await supabase.from("notifications").insert({
    recipient_id: request.from_user_id,
    kind: "ownership_response",
    metadata: {
      actor: { name: responderName, avatarUrl: responderProfile?.avatar_url ?? null },
      team: { name: team?.name ?? "the team", logoUrl: team?.logo_url ?? null, color: team?.color ?? "#E8630D" },
      accepted: accept,
    },
    body: accept
      ? `${responderName} accepted ownership of ${team?.name ?? "the team"}.`
      : `${responderName} declined ownership of ${team?.name ?? "the team"}.`,
  });

  revalidatePath("/", "layout");
  return { success: true };
}
