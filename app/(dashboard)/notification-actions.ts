"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
    .select("id, team_id, invited_user_id, proposed_roles, status")
    .eq("id", inviteId)
    .single();

  if (!invite || invite.invited_user_id !== user.id) {
    return { error: "Invite not found." };
  }
  if (invite.status !== "pending") {
    return { error: "This invite has already been responded to." };
  }

  if (accept) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single();

    const { data: teamMember, error: memberError } = await supabase
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
      await supabase.from("member_roles").insert(
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

  revalidatePath("/", "layout");
  return { success: true };
}
