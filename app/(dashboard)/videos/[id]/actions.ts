"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAGE_ORDER, STAGE_LABELS } from "@/modules/long-videos/lib/stages";
import type { PipelineStage, RoleId } from "@/lib/permissions/roles";
import { getMembership, canActOnStage } from "@/lib/permissions/membership";
import { isMaster, ROLES } from "@/lib/permissions/roles";
import { displayName } from "@/lib/avatar";
import { buildMentionCatalog, resolveMentionRecipients } from "@/lib/mentions";

/**
 * Deletes a project permanently — master-only, checked here before doing
 * anything. Uses the admin client for the actual deletion so we can also
 * clean up the project's uploaded files (thumbnails, chat attachments),
 * which live in storage and aren't covered by the database's own cascade
 * deletes on the comment/title/assignee rows.
 */
export async function deleteProject(projectId: string, teamId: string) {
  const supabase = await createClient();
  const membership = await getMembership(supabase, teamId);
  if (!isMaster(membership?.roles ?? [])) {
    return { error: "Only the master can delete a project." };
  }

  const admin = createAdminClient();

  const [{ data: thumbFiles }, { data: attachFiles }] = await Promise.all([
    admin.storage.from("thumbnails").list(projectId),
    admin.storage.from("comment-attachments").list(projectId),
  ]);
  if (thumbFiles && thumbFiles.length > 0) {
    await admin.storage.from("thumbnails").remove(thumbFiles.map((f) => `${projectId}/${f.name}`));
  }
  if (attachFiles && attachFiles.length > 0) {
    await admin.storage.from("comment-attachments").remove(attachFiles.map((f) => `${projectId}/${f.name}`));
  }

  const { error } = await admin.from("long_video_projects").delete().eq("id", projectId);
  if (error) return { error: "Couldn't delete the project — try again." };

  revalidatePath("/videos");
  redirect("/videos");
}

const VIDEO_TYPES = ["Hub", "Help", "Hero"];

export async function updateTypeTheme(
  projectId: string,
  teamId: string,
  videoType: string[],
  theme: string,
  subtheme: string
) {
  if (videoType.length === 0) return { error: "Pick at least one type." };
  if (!theme.trim()) return { error: "Theme can't be empty." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  const membership = await getMembership(supabase, teamId);
  if (!isMaster(membership?.roles ?? []) && !canActOnStage(membership, "ideate")) {
    return { error: "You don't have access to edit this." };
  }

  const { error } = await supabase
    .from("long_video_projects")
    .update({
      video_type: videoType.filter((t) => VIDEO_TYPES.includes(t)),
      theme: theme.trim(),
      subtheme: subtheme.trim() || null,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", projectId);

  if (error) return { error: "Couldn't save — try again." };

  revalidatePath(`/videos/${projectId}`);
  revalidatePath("/videos");
  return { success: true };
}

export async function updateExpectedDate(
  projectId: string,
  teamId: string,
  date: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  const membership = await getMembership(supabase, teamId);
  if (!isMaster(membership?.roles ?? []) && !canActOnStage(membership, "ideate")) {
    return { error: "You don't have access to edit this." };
  }

  const { error } = await supabase
    .from("long_video_projects")
    .update({ expected_date: date || null, updated_at: new Date().toISOString(), updated_by: user.id })
    .eq("id", projectId);

  if (error) return { error: "Couldn't save — try again." };

  revalidatePath(`/videos/${projectId}`);
  revalidatePath("/videos");
  return { success: true };
}

const EDITABLE_FIELDS = ["hook", "notes", "budget_notes"] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

/**
 * Inline-edit for the free-text Ideate fields. Same access rule as the
 * rest of Ideate (ideate-stage holders, or master) — checked here in
 * addition to the RLS policy on long_video_projects, since this can be
 * called at any point in the project's life, not just while it's
 * actually in the Ideate stage.
 */
export async function updateIdeateField(
  projectId: string,
  teamId: string,
  field: EditableField,
  value: string
) {
  if (!EDITABLE_FIELDS.includes(field)) return { error: "Not editable." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  const membership = await getMembership(supabase, teamId);
  if (!isMaster(membership?.roles ?? []) && !canActOnStage(membership, "ideate")) {
    return { error: "You don't have access to edit this." };
  }

  const { error } = await supabase
    .from("long_video_projects")
    .update({ [field]: value || null, updated_at: new Date().toISOString(), updated_by: user.id })
    .eq("id", projectId);

  if (error) return { error: "Couldn't save — try again." };

  revalidatePath(`/videos/${projectId}`);
  return { success: true, updatedAt: new Date().toISOString() };
}

/**
 * The inverse of advanceStage — moves a project one stage backward.
 * Master-only, same as advancing; the RLS update policy is the real
 * enforcement.
 */
export async function regressStage(projectId: string) {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("long_video_projects")
    .select("id, team_id, stage, title")
    .eq("id", projectId)
    .single();

  if (!project) return { error: "Project not found." };

  const currentIndex = STAGE_ORDER.indexOf(project.stage as PipelineStage);
  const prev = STAGE_ORDER[currentIndex - 1];
  if (!prev) return { error: "Already at the first stage." };

  const { error } = await supabase
    .from("long_video_projects")
    .update({ stage: prev })
    .eq("id", projectId);

  if (error) {
    return {
      error:
        "Couldn't move this back — you may not have permission to do this.",
    };
  }

  const { data: assignees } = await supabase
    .from("project_assignees")
    .select("team_members(user_id)")
    .eq("project_id", projectId)
    .eq("stage", prev);

  const recipients = (assignees ?? [])
    .map((a) => (a.team_members as unknown as { user_id: string })?.user_id)
    .filter(Boolean);

  if (recipients.length > 0) {
    await supabase.from("notifications").insert(
      recipients.map((recipient_id) => ({
        recipient_id,
        project_id: projectId,
        stage: prev,
        body: `"${project.title}" moved back to ${STAGE_LABELS[prev]}.`,
      }))
    );
  }

  revalidatePath(`/videos/${projectId}`);
  revalidatePath("/videos");
  return { success: true };
}

/**
 * Advances a project to its next stage. Only the master can do this —
 * the button is hidden from everyone else in the UI, but the database's
 * RLS policy is what actually stops anyone from bypassing that by
 * calling this directly.
 */
export async function advanceStage(projectId: string) {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("long_video_projects")
    .select("id, team_id, stage, title")
    .eq("id", projectId)
    .single();

  if (!project) return { error: "Project not found." };

  const currentIndex = STAGE_ORDER.indexOf(project.stage as PipelineStage);
  const next = STAGE_ORDER[currentIndex + 1];
  if (!next) return { error: "Already at the final stage." };

  const { error } = await supabase
    .from("long_video_projects")
    .update({ stage: next })
    .eq("id", projectId);

  if (error) {
    return {
      error:
        "Couldn't advance the project — you may not have permission to do this.",
    };
  }

  // Notify whoever is already assigned to the new stage.
  const { data: assignees } = await supabase
    .from("project_assignees")
    .select("team_members(user_id)")
    .eq("project_id", projectId)
    .eq("stage", next);

  const recipients = (assignees ?? [])
    .map((a) => (a.team_members as unknown as { user_id: string })?.user_id)
    .filter(Boolean);

  if (recipients.length > 0) {
    await supabase.from("notifications").insert(
      recipients.map((recipient_id) => ({
        recipient_id,
        project_id: projectId,
        stage: next,
        body: `"${project.title}" moved into ${STAGE_LABELS[next]} — you have work to do.`,
      }))
    );
  }

  revalidatePath(`/videos/${projectId}`);
  revalidatePath("/videos");
  return { success: true };
}

export async function assignMember(
  projectId: string,
  stage: PipelineStage,
  teamMemberId: string
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("project_assignees")
    .insert({ project_id: projectId, stage, team_member_id: teamMemberId });

  if (error) {
    return { error: "Couldn't assign — check they hold a role for this stage." };
  }

  const { data: project } = await supabase
    .from("long_video_projects")
    .select("title")
    .eq("id", projectId)
    .single();

  const { data: member } = await supabase
    .from("team_members")
    .select("user_id")
    .eq("id", teamMemberId)
    .single();

  if (member && project) {
    await supabase.from("notifications").insert({
      recipient_id: member.user_id,
      project_id: projectId,
      stage,
      body: `You've been tagged on "${project.title}" for ${STAGE_LABELS[stage]}.`,
    });
  }

  revalidatePath(`/videos/${projectId}`);
  return { success: true };
}

export async function removeAssignee(projectId: string, assigneeRowId: string) {
  const supabase = await createClient();
  await supabase.from("project_assignees").delete().eq("id", assigneeRowId);
  revalidatePath(`/videos/${projectId}`);
}

export async function postComment(
  projectId: string,
  stage: PipelineStage,
  formData: FormData
) {
  const body = String(formData.get("body") ?? "").trim();
  const attachmentsRawForCheck = String(formData.get("attachments") ?? "[]");
  const hasAttachments = attachmentsRawForCheck !== "[]" && attachmentsRawForCheck !== "";
  if (!body && !hasAttachments) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: project } = await supabase
    .from("long_video_projects")
    .select("team_id, title")
    .eq("id", projectId)
    .single();
  if (!project) return;

  const { data: newComment, error } = await supabase
    .from("project_comments")
    .insert({
      project_id: projectId,
      stage,
      author_id: user.id,
      body,
    })
    .select("id")
    .single();
  if (error || !newComment) return;

  const attachmentsRaw = String(formData.get("attachments") ?? "[]");
  try {
    const attachments = JSON.parse(attachmentsRaw) as {
      name: string;
      path: string;
      size: number;
      type: string;
    }[];
    if (attachments.length > 0) {
      await supabase.from("comment_attachments").insert(
        attachments.map((a) => ({
          comment_id: newComment.id,
          file_name: a.name,
          file_path: a.path,
          file_size: a.size,
          mime_type: a.type,
        }))
      );
    }
  } catch {
    // Malformed attachments payload — the comment itself still posted fine.
  }

  // Resolve @mentions (@name, @RoleName, @all) into real notifications.
  const [{ data: teamMembers }, { data: authorProfile }] = await Promise.all([
    supabase
      .from("team_members")
      .select("user_id, profiles(username, full_name, email), member_roles(role)")
      .eq("team_id", project.team_id)
      .eq("status", "active"),
    supabase
      .from("profiles")
      .select("username, full_name, email")
      .eq("id", user.id)
      .single(),
  ]);

  const members = (teamMembers ?? []).map((m) => {
    const profile = m.profiles as unknown as { username: string | null; full_name: string | null; email: string | null } | null;
    return {
      userId: m.user_id as string,
      name: displayName(profile?.username, profile?.full_name, profile?.email),
      roles: (m.member_roles ?? []).map((r: { role: RoleId }) => r.role),
    };
  });

  const catalog = buildMentionCatalog(
    members.map((m) => ({ userId: m.userId, name: m.name })),
    ROLES.map((r) => ({ id: r.id, name: r.name }))
  );
  const recipientIds = resolveMentionRecipients(body, catalog, members);
  recipientIds.delete(user.id);

  if (recipientIds.size > 0) {
    const authorName = displayName(authorProfile?.username, authorProfile?.full_name, authorProfile?.email);
    const snippet = body.length > 80 ? `${body.slice(0, 80)}…` : body;
    await supabase.from("notifications").insert(
      Array.from(recipientIds).map((recipient_id) => ({
        recipient_id,
        project_id: projectId,
        stage,
        body: `${authorName} mentioned you in ${STAGE_LABELS[stage]} on "${project.title}": "${snippet}"`,
      }))
    );
  }

  revalidatePath(`/videos/${projectId}`);
}

export async function deleteComment(commentId: string, projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_comments")
    .delete()
    .eq("id", commentId);

  if (error) {
    return { error: "Couldn't delete — you may not have permission." };
  }

  revalidatePath(`/videos/${projectId}`);
  return { success: true };
}
