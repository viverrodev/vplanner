import type { SupabaseClient } from "@supabase/supabase-js";
import { type RoleId, hasStageAccess, isMaster, type PipelineStage } from "./roles";

export type Membership = {
  teamMemberId: string;
  roles: RoleId[];
};

/**
 * The current user's team_members row + roles for a given team.
 * UI-side only — used to decide what to show/hide. The database's own
 * RLS policies are the real enforcement; this just keeps the interface
 * from offering buttons that would fail anyway.
 */
export async function getMembership(
  supabase: SupabaseClient,
  teamId: string
): Promise<Membership | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("team_members")
    .select("id, member_roles(role)")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (!data) return null;

  return {
    teamMemberId: data.id,
    roles: (data.member_roles ?? []).map(
      (r: { role: RoleId }) => r.role
    ) as RoleId[],
  };
}

export function canActOnStage(
  membership: Membership | null,
  stage: PipelineStage
): boolean {
  if (!membership) return false;
  return isMaster(membership.roles) || hasStageAccess(membership.roles, stage);
}
