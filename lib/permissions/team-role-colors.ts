import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLES, defaultRoleColor, type RoleId } from "./roles";

export async function getRoleColors(
  supabase: SupabaseClient,
  teamId: string
): Promise<Record<RoleId, string>> {
  const colors = Object.fromEntries(
    ROLES.map((r) => [r.id, defaultRoleColor(r.id)])
  ) as Record<RoleId, string>;

  const { data } = await supabase
    .from("role_colors")
    .select("role, color")
    .eq("team_id", teamId);

  (data ?? []).forEach((row: { role: RoleId; color: string }) => {
    colors[row.role] = row.color;
  });

  return colors;
}
