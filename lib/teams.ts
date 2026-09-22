import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

export const CURRENT_TEAM_COOKIE = "vp_team";

export type TeamSummary = {
  id: string;
  name: string;
  slug: string;
  color: string;
};

/**
 * Every team the current user is an active member of, plus which one
 * should be treated as "current" for this request — either whatever
 * they last switched to (stored in a cookie) or the first team they
 * belong to, as a sensible default.
 */
export async function getTeamsAndCurrent(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { teams: [] as TeamSummary[], currentTeam: null };

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, slug, color, team_members!inner(user_id, status)")
    .eq("team_members.user_id", user.id)
    .eq("team_members.status", "active")
    .order("created_at", { ascending: true });

  const list: TeamSummary[] = (teams ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    color: t.color,
  }));

  if (list.length === 0) return { teams: list, currentTeam: null };

  const cookieStore = await cookies();
  const savedId = cookieStore.get(CURRENT_TEAM_COOKIE)?.value;
  const currentTeam = list.find((t) => t.id === savedId) ?? list[0];

  return { teams: list, currentTeam };
}
