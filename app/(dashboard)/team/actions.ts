"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster, ROLES } from "@/lib/permissions/roles";
import type { RoleId } from "@/lib/permissions/roles";
import { displayName } from "@/lib/avatar";

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
      return { error: "They already have a pending invite to this team." };
    }
    return { error: "Couldn't send the invite. Try again." };
  }

  const inviterName = displayName(inviterProfile?.username, inviterProfile?.full_name, inviterProfile?.email);

  const { error: notifyError } = await supabase.from("notifications").insert({
    recipient_id: userId,
    team_invite_id: invite.id,
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
  const { data: team } = await supabase.from("teams").select("owner_id").eq("id", teamId).single();
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

  revalidatePath("/team");
  return { success: true };
}

export async function kickMember(teamId: string, teamMemberId: string) {
  const check = await requireMaster(teamId);
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();

  const { data: team } = await supabase.from("teams").select("owner_id").eq("id", teamId).single();
  const { data: member } = await supabase
    .from("team_members")
    .select("user_id")
    .eq("id", teamMemberId)
    .single();

  if (team && member && member.user_id === team.owner_id) {
    return { error: "The team's owner can't be removed." };
  }

  await supabase.from("team_members").delete().eq("id", teamMemberId);
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
export async function transferOwnership(teamId: string, newOwnerUserId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  const { data: team } = await supabase.from("teams").select("owner_id, name").eq("id", teamId).single();
  if (!team || team.owner_id !== user.id) {
    return { error: "Only the current owner can transfer ownership." };
  }
  if (newOwnerUserId === user.id) {
    return { error: "That's already you." };
  }

  const { data: newOwnerMember } = await supabase
    .from("team_members")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", newOwnerUserId)
    .eq("status", "active")
    .single();

  if (!newOwnerMember) {
    return { error: "They need to be an active member of this team first." };
  }

  const { error } = await supabase.from("teams").update({ owner_id: newOwnerUserId }).eq("id", teamId);
  if (error) return { error: "Couldn't transfer ownership — try again." };

  await supabase
    .from("member_roles")
    .upsert({ team_member_id: newOwnerMember.id, role: "master" }, { onConflict: "team_member_id,role" });

  await supabase.from("notifications").insert({
    recipient_id: newOwnerUserId,
    body: `You're now the owner of ${team.name}.`,
  });

  revalidatePath("/team");
  return { success: true };
}
