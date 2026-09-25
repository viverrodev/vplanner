"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";

export type CreateProjectState = { error?: string } | undefined;

export async function createProject(
  _prevState: CreateProjectState,
  formData: FormData
): Promise<CreateProjectState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };

  const { currentTeam } = await getTeamsAndCurrent(supabase);
  if (!currentTeam) return { error: "Create a team first." };

  const membership = await getMembership(supabase, currentTeam.id);
  const myRoles = membership?.roles ?? [];
  if (!isMaster(myRoles) && !myRoles.includes("publisher")) {
    return { error: "Only the master or a scheduler can create long videos." };
  }

  const titles = formData
    .getAll("titles")
    .map((t) => String(t).trim())
    .filter(Boolean)
    .slice(0, 5);

  if (titles.length < 2) {
    return { error: "Add at least 2 possible titles." };
  }

  const pickedIndex = Number(formData.get("pickedTitle") ?? 0);
  const hook = String(formData.get("hook") ?? "").trim();
  if (!hook) return { error: "Every idea needs a hook." };

  const videoType = formData.getAll("type").map(String);
  const theme = String(formData.get("theme") ?? "").trim();
  const subtheme = String(formData.get("subtheme") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const budgetNotes = String(formData.get("budget_notes") ?? "").trim();
  const expectedDate = String(formData.get("expected_date") ?? "") || null;

  if (!theme) return { error: "Pick a theme." };
  if (videoType.length === 0) return { error: "Pick at least one type." };

  const mainTitle = titles[pickedIndex] ?? titles[0];

  const { data: project, error } = await supabase
    .from("long_video_projects")
    .insert({
      team_id: currentTeam.id,
      title: mainTitle,
      video_type: videoType,
      theme,
      subtheme: subtheme || null,
      hook,
      notes: notes || null,
      budget_notes: budgetNotes || null,
      expected_date: expectedDate,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !project) {
    return { error: "Couldn't create the project. Try again." };
  }

  const titleRows = titles.map((title, i) => ({
    project_id: project.id,
    title,
    is_picked: i === pickedIndex,
    position: i,
  }));
  await supabase.from("project_titles").insert(titleRows);

  redirect(`/videos/${project.id}`);
}
