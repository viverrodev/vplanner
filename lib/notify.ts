import { displayName } from "./avatar";

type SupabaseLike = {
  from: (table: string) => any;
};

export async function actorMeta(supabase: SupabaseLike, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("username, full_name, email, avatar_url")
    .eq("id", userId)
    .single();
  return {
    name: displayName(data?.username, data?.full_name, data?.email),
    avatarUrl: data?.avatar_url ?? null,
  };
}

export async function teamMeta(supabase: SupabaseLike, teamId: string) {
  const { data } = await supabase
    .from("teams")
    .select("name, logo_url, color")
    .eq("id", teamId)
    .single();
  return {
    name: data?.name ?? "a team",
    logoUrl: data?.logo_url ?? null,
    color: data?.color ?? "#E8630D",
  };
}
