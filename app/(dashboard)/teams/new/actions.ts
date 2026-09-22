"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CreateTeamState = { error?: string } | undefined;

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "team"
  );
}

const TEAM_COLORS = [
  "#E8630D",
  "#178C7C",
  "#3159C9",
  "#6B4FD6",
  "#B84070",
  "#B4890E",
];

export async function createTeam(
  _prevState: CreateTeamState,
  formData: FormData
): Promise<CreateTeamState> {
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    return { error: "Give your team a name." };
  }
  if (name.length > 60) {
    return { error: "Keep the name under 60 characters." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your session expired — sign in again." };
  }

  const baseSlug = slugify(name);
  const color = TEAM_COLORS[Math.floor(Math.random() * TEAM_COLORS.length)];

  // Try the clean slug first, fall back to a suffixed one on collision
  // rather than asking the person to think about URLs at all.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const { data, error } = await supabase
      .from("teams")
      .insert({ name, slug, owner_id: user.id, color })
      .select("id")
      .single();

    if (!error && data) {
      redirect(`/dashboard`);
    }
    if (error && error.code !== "23505") {
      // Not a "slug already taken" conflict — a real problem.
      return { error: "Couldn't create the team. Try again." };
    }
  }

  return { error: "Couldn't find an available name. Try something else." };
}
