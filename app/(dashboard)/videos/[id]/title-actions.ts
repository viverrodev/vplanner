"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMembership, canActOnStage } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";

/**
 * Editing a title's text is the same access rule as the rest of Ideate
 * (anyone with ideate access, or master) — checked here in addition to
 * the RLS policy on project_titles.
 */
export async function updateTitleText(
  projectId: string,
  teamId: string,
  titleId: string,
  text: string
) {
  if (!text.trim()) return { error: "A title can't be empty." };

  const supabase = await createClient();
  const membership = await getMembership(supabase, teamId);
  if (!isMaster(membership?.roles ?? []) && !canActOnStage(membership, "ideate")) {
    return { error: "You don't have access to edit titles here." };
  }

  const { error } = await supabase
    .from("project_titles")
    .update({ title: text.trim() })
    .eq("id", titleId);

  if (error) return { error: "Couldn't save — try again." };

  // If this title happens to be the picked one, keep the project's main
  // title column in sync so the header and list cards match.
  const { data: titleRow } = await supabase
    .from("project_titles")
    .select("is_picked")
    .eq("id", titleId)
    .single();

  if (titleRow?.is_picked) {
    await supabase
      .from("long_video_projects")
      .update({ title: text.trim() })
      .eq("id", projectId);
  }

  revalidatePath(`/videos/${projectId}`);
  revalidatePath("/videos");
  return { success: true };
}

/**
 * Picking the "final" title is a bigger call than just editing an idea,
 * so — unlike the rest of Ideate, which anyone with ideate access can
 * touch — this is deliberately restricted to the master, checked here
 * in addition to whatever the UI already hides.
 */
export async function setPrimaryTitle(
  projectId: string,
  teamId: string,
  titleId: string,
  titleText: string
) {
  const supabase = await createClient();
  const membership = await getMembership(supabase, teamId);

  if (!isMaster(membership?.roles ?? [])) {
    return { error: "Only the master can pick the final title." };
  }

  await supabase
    .from("project_titles")
    .update({ is_picked: false })
    .eq("project_id", projectId);
  await supabase
    .from("project_titles")
    .update({ is_picked: true })
    .eq("id", titleId);
  await supabase
    .from("long_video_projects")
    .update({ title: titleText })
    .eq("id", projectId);

  revalidatePath(`/videos/${projectId}`);
  revalidatePath("/videos");
  return { success: true };
}
