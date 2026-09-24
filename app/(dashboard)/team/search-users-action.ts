"use server";

import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";

export type InviteCandidate = {
  id: string;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
};

export async function searchInvitableUsers(
  teamId: string,
  query: string
): Promise<InviteCandidate[]> {
  const supabase = await createClient();
  const membership = await getMembership(supabase, teamId);
  if (!isMaster(membership?.roles ?? [])) return [];

  // Strip characters that have meaning inside a PostgREST filter string
  // (commas/parens split or nest conditions; % and * are wildcards) so a
  // search can't rewrite the query itself.
  const q = query.replace(/[,()*%\\"]/g, " ").trim().slice(0, 64);
  if (q.length < 2) return [];

  const [{ data: existingMembers }, { data: pendingInvites }] = await Promise.all([
    supabase.from("team_members").select("user_id").eq("team_id", teamId),
    supabase
      .from("team_invites")
      .select("invited_user_id")
      .eq("team_id", teamId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString()),
  ]);

  const excludeIds = new Set(
    [
      ...(existingMembers ?? []).map((m) => m.user_id).filter(Boolean),
      ...(pendingInvites ?? []).map((i) => i.invited_user_id),
    ] as string[]
  );

  const { data: matches } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url, email")
    .or(`username.ilike.%${q}%,full_name.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(20);

  return (matches ?? [])
    .filter((m) => !excludeIds.has(m.id))
    .slice(0, 8)
    .map((m) => ({
      id: m.id,
      username: m.username,
      fullName: m.full_name,
      avatarUrl: m.avatar_url,
    }));
}
