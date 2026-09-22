"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster, ROLES } from "@/lib/permissions/roles";
import type { RoleId } from "@/lib/permissions/roles";
import { headers } from "next/headers";

async function requireMaster(teamId: string) {
  const supabase = await createClient();
  const membership = await getMembership(supabase, teamId);
  if (!isMaster(membership?.roles ?? [])) {
    return { ok: false as const, error: "Only the master can do this." };
  }
  return { ok: true as const };
}

export async function inviteMember(
  teamId: string,
  email: string,
  roleIds: RoleId[]
) {
  const check = await requireMaster(teamId);
  if (!check.ok) return { error: check.error };

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes("@")) return { error: "Enter a valid email." };

  const validRoles = roleIds.filter(
    (r) => r !== "master" && ROLES.some((role) => role.id === r)
  );

  const supabase = await createClient();

  // Reserve the invite slot first — this is what makes handle_new_user()
  // able to auto-link them the instant they accept, and what RLS uses to
  // decide they're a real (if not-yet-active) team member.
  const { data: teamMember, error: insertError } = await supabase
    .from("team_members")
    .insert({ team_id: teamId, invited_email: normalizedEmail, status: "invited" })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return { error: "That email has already been invited to this team." };
    }
    return { error: "Couldn't create the invite. Try again." };
  }

  if (validRoles.length > 0) {
    await supabase
      .from("member_roles")
      .insert(validRoles.map((role) => ({ team_member_id: teamMember.id, role })));
  }

  const origin = (await headers()).get("origin") ?? "";
  const admin = createAdminClient();
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    normalizedEmail,
    { redirectTo: `${origin}/api/auth/callback?next=/set-password` }
  );

  if (inviteError) {
    // Roll back the reservation so a failed email doesn't leave a dangling
    // invite the master can't see or retry cleanly.
    await supabase.from("team_members").delete().eq("id", teamMember.id);
    return { error: `Couldn't send the invite email: ${inviteError.message}` };
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
