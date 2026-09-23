"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster, ROLES } from "@/lib/permissions/roles";
import type { RoleId } from "@/lib/permissions/roles";
import { displayName } from "@/lib/avatar";
import { actorMeta, teamMeta } from "@/lib/notify";
import { getRoleColors } from "@/lib/permissions/team-role-colors";

async function requireMaster(teamId: string) {
  const supabase = await createClient();
  const membership = await getMembership(supabase, teamId);
  if (!isMaster(membership?.roles ?? [])) {
    return { ok: false as const, error: "Only the master can do this." };
  }
  return { ok: true as const };
}

/**
 * Invites an EXISTING VPlanner account to join this team. This does not
 * create any account — that only ever happens via the Supabase
 * dashboard, done directly by the project owner. This just sends the
 * person a real in-app notification they can accept or decline; nothing
 * about their team membership changes until they respond.
 */
export async function inviteExistingUser(
  teamId: string,
  userId: string,
  roleIds: RoleId[]
) {
  const check = await requireMaster(teamId);
  if (!check.ok) return { error: check.error };

  const validRoles = roleIds.filter(
    (r) => r !== "master" && ROLES.some((role) => role.id === r)
  );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  // Clear out any of THEIR pending invites to THIS team that have gone
  // stale (past the 1-hour window) — this is what makes re-inviting
  // possible after a failure, without weakening the rule that a
  // genuinely still-live pending invite blocks a duplicate.
  await supabase
    .from("team_invites")
    .update({ status: "expired" })
    .eq("team_id", teamId)
    .eq("invited_user_id", userId)
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());

  const [{ data: team }, { data: inviterProfile }] = await Promise.all([
    supabase.from("teams").select("name").eq("id", teamId).single(),
    supabase.from("profiles").select("username, full_name, email").eq("id", user.id).single(),
  ]);

  const { data: invite, error } = await supabase
    .from("team_invites")
    .insert({
      team_id: teamId,
      invited_user_id: userId,
      invited_by: user.id,
      proposed_roles: validRoles,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "They already have a live invite to this team (expires within an hour of being sent)." };
    }
    return { error: "Couldn't send the invite. Try again." };
  }

  const inviterName = displayName(inviterProfile?.username, inviterProfile?.full_name, inviterProfile?.email);
  const actor = await actorMeta(supabase, user.id);
  const teamInfo = await teamMeta(supabase, teamId);

  const { error: notifyError } = await supabase.from("notifications").insert({
    recipient_id: userId,
    team_invite_id: invite.id,
    kind: "team_invite",
    metadata: { actor, team: teamInfo },
    body: `${inviterName} invited you to join ${team?.name ?? "a team"}.`,
  });

  if (notifyError) {
    // Without the notification, the invite is genuinely undiscoverable
    // by the invited person — don't leave a dangling invite they'll
    // never see. Roll back and report the real failure.
    await supabase.from("team_invites").delete().eq("id", invite.id);
    return { error: "Couldn't notify them — try again." };
  }

  revalidatePath("/team");
  return { success: true };
}

export async function cancelInvite(teamId: string, inviteId: string) {
  const check = await requireMaster(teamId);
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("team_invites").delete().eq("id", inviteId).eq("team_id", teamId);
  if (error) return { error: "Couldn't cancel the invite." };

  revalidatePath("/team");
  return { success: true };
}

/**
 * Deletes a team permanently — owner-only (not just any master, since
 * this destroys everyone's work on the team, not a single master-level
 * decision), and blocked entirely while any social account is
 * connected. That's a deliberate hard stop, not just a warning:
 * disconnecting first is a real, separate decision the owner has to
 * make on purpose, since it likely affects scheduled/published content
 * tied to that account.
 */
export async function deleteTeam(teamId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  const { data: team } = await supabase.from("teams").select("owner_id").eq("id", teamId).single();
  if (!team || team.owner_id !== user.id) {
    return { error: "Only the team's owner can delete it." };
  }

  const { data: connected } = await supabase
    .from("connected_accounts")
    .select("platform")
    .eq("team_id", teamId)
    .eq("status", "connected");

  if (connected && connected.length > 0) {
    return {
      error: `Disconnect ${connected.map((c) => c.platform).join(", ")} first — you can't delete a team with a connected social account.`,
    };
  }

  const admin = createAdminClient();

  const { data: projects } = await admin
    .from("long_video_projects")
    .select("id")
    .eq("team_id", teamId);

  await Promise.all(
    (projects ?? []).flatMap((p) => [
      (async () => {
        const { data } = await admin.storage.from("thumbnails").list(p.id);
        if (data && data.length > 0) {
          await admin.storage.from("thumbnails").remove(data.map((f) => `${p.id}/${f.name}`));
        }
      })(),
      (async () => {
        const { data } = await admin.storage.from("comment-attachments").list(p.id);
        if (data && data.length > 0) {
          await admin.storage.from("comment-attachments").remove(data.map((f) => `${p.id}/${f.name}`));
        }
      })(),
    ])
  );

  const { data: logoFiles } = await admin.storage.from("team-logos").list(teamId);
  if (logoFiles && logoFiles.length > 0) {
    await admin.storage.from("team-logos").remove(logoFiles.map((f) => `${teamId}/${f.name}`));
  }

  const { error } = await admin.from("teams").delete().eq("id", teamId);
  if (error) return { error: "Couldn't delete the team — try again." };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function setMemberRoles(
  teamId: string,
  teamMemberId: string,
  roleIds: RoleId[]
) {
  const check = await requireMaster(teamId);
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();

  // The team's owner is always its master — a permanent invariant, not
  // just a "need at least one" rule. This is what actually stops the
  // exact bug that happened: the owner accidentally unchecking their
  // own Master box.
  const { data: team } = await supabase.from("teams").select("owner_id, name").eq("id", teamId).single();
  const { data: targetMember } = await supabase
    .from("team_members")
    .select("user_id")
    .eq("id", teamMemberId)
    .single();

  if (team && targetMember && targetMember.user_id === team.owner_id && !roleIds.includes("master")) {
    return { error: "The team owner is always Master — that can't be changed." };
  }

  // Safeguard: never let the team end up with zero masters.
  const wasMaster = await supabase
    .from("member_roles")
    .select("role")
    .eq("team_member_id", teamMemberId)
    .eq("role", "master")
    .maybeSingle();

  if (wasMaster.data && !roleIds.includes("master")) {
    const { count } = await supabase
      .from("member_roles")
      .select("team_member_id, team_members!inner(team_id)", { count: "exact", head: true })
      .eq("role", "master")
      .eq("team_members.team_id", teamId);
    if ((count ?? 0) <= 1) {
      return { error: "Every team needs at least one master — assign it to someone else first." };
    }
  }

  await supabase.from("member_roles").delete().eq("team_member_id", teamMemberId);
  if (roleIds.length > 0) {
    await supabase
      .from("member_roles")
      .insert(roleIds.map((role) => ({ team_member_id: teamMemberId, role })));
  }

  if (targetMember?.user_id) {
    const teamRoleColors = await getRoleColors(supabase, teamId);
    const roleObjs = roleIds
      .map((r) => {
        const name = ROLES.find((role) => role.id === r)?.name;
        return name ? { name, color: teamRoleColors[r] ?? "#999" } : null;
      })
      .filter(Boolean);
    const teamInfo = await teamMeta(supabase, teamId);
    await supabase.from("notifications").insert({
      recipient_id: targetMember.user_id,
      kind: "role_changed",
      metadata: { team: teamInfo, roles: roleObjs },
      body:
        roleObjs.length > 0
          ? `Your role on ${team?.name ?? "the team"} changed to ${roleObjs.map((r) => r!.name).join(", ")}.`
          : `Your roles on ${team?.name ?? "the team"} were cleared.`,
    });
  }

  revalidatePath("/team");
  return { success: true };
}

export async function kickMember(teamId: string, teamMemberId: string) {
  const check = await requireMaster(teamId);
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();

  const { data: team } = await supabase.from("teams").select("owner_id, name").eq("id", teamId).single();
  const { data: member } = await supabase
    .from("team_members")
    .select("user_id")
    .eq("id", teamMemberId)
    .single();

  if (team && member && member.user_id === team.owner_id) {
    return { error: "The team's owner can't be removed." };
  }

  await supabase.from("team_members").delete().eq("id", teamMemberId);

  if (member?.user_id) {
    const teamInfo = await teamMeta(supabase, teamId);
    await supabase.from("notifications").insert({
      recipient_id: member.user_id,
      kind: "kicked",
      metadata: { team: teamInfo },
      body: `You were removed from ${team?.name ?? "a team"}.`,
    });
  }

  revalidatePath("/team");
  return { success: true };
}

export async function updateTeamName(teamId: string, name: string) {
  const check = await requireMaster(teamId);
  if (!check.ok) return { error: check.error };
  if (!name.trim()) return { error: "Team name can't be empty." };

  const supabase = await createClient();
  await supabase.from("teams").update({ name: name.trim() }).eq("id", teamId);
  revalidatePath("/team");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateTeamLogo(teamId: string, logoUrl: string | null) {
  const check = await requireMaster(teamId);
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  await supabase.from("teams").update({ logo_url: logoUrl }).eq("id", teamId);
  revalidatePath("/team");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function setRoleColor(teamId: string, role: RoleId, color: string) {
  const check = await requireMaster(teamId);
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  await supabase
    .from("role_colors")
    .upsert({ team_id: teamId, role, color }, { onConflict: "team_id,role" });

  revalidatePath("/team");
  return { success: true };
}

/**
 * Hands ownership of the team to another active member. Restricted to
 * the CURRENT owner specifically — not just any master — since this is
 * fundamentally "I'm relinquishing my own ownership," not a general
 * management action. The new owner automatically gets Master (the
 * "owner is always master" invariant has to hold immediately, not as a
 * follow-up step); the outgoing owner keeps whatever roles they already
 * had and is free to edit their own roles afterward, since they're no
 * longer owner-locked.
 */
export async function requestOwnershipTransfer(teamId: string, toUserId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  const { data: team } = await supabase.from("teams").select("owner_id, name").eq("id", teamId).single();
  if (!team || team.owner_id !== user.id) {
    return { error: "Only the current owner can request a transfer." };
  }
  if (toUserId === user.id) {
    return { error: "That's already you." };
  }

  const { data: targetMember } = await supabase
    .from("team_members")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", toUserId)
    .eq("status", "active")
    .single();

  if (!targetMember) {
    return { error: "They need to be an active member of this team first." };
  }

  // Clear any stale (expired) request for this team so a fresh one can
  // go out — same pattern as team invites.
  await supabase
    .from("ownership_transfer_requests")
    .update({ status: "expired" })
    .eq("team_id", teamId)
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());

  const { data: request, error } = await supabase
    .from("ownership_transfer_requests")
    .insert({ team_id: teamId, from_user_id: user.id, to_user_id: toUserId })
    .select("id")
    .single();

  if (error || !request) {
    if (error?.code === "23505") {
      return { error: "There's already a live transfer request for this team." };
    }
    return { error: "Couldn't send the request — try again." };
  }

  const actor = await actorMeta(supabase, user.id);
  const teamInfo = await teamMeta(supabase, teamId);

  const { error: notifyError } = await supabase.from("notifications").insert({
    recipient_id: toUserId,
    ownership_transfer_id: request.id,
    kind: "ownership_request",
    metadata: { actor, team: teamInfo },
    body: `${team.name} owner wants to make you the new owner.`,
  });

  if (notifyError) {
    await supabase.from("ownership_transfer_requests").delete().eq("id", request.id);
    return { error: "Couldn't notify them — try again." };
  }

  revalidatePath("/team");
  return { success: true };
}
