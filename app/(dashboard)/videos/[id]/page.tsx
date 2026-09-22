import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership, canActOnStage } from "@/lib/permissions/membership";
import { isMaster, roleAllowsStage, ROLES } from "@/lib/permissions/roles";
import type { PipelineStage, RoleId } from "@/lib/permissions/roles";
import { STAGE_LABELS, STAGE_ORDER, stageColor } from "@/modules/long-videos/lib/stages";
import { getCachedUser } from "@/lib/supabase/get-user";
import { colorForId, displayName } from "@/lib/avatar";
import { getRoleColors } from "@/lib/permissions/team-role-colors";
import { buildMentionCatalog } from "@/lib/mentions";
import { AdvanceStageButton, RegressStageButton } from "./advance-button";
import { AssigneeRow } from "./assignee-row";
import { TitleList } from "./title-list";
import { ThumbnailUploader } from "./thumbnail-uploader";
import { InlineEditable } from "./inline-editable";
import { ExpectedDateEditor } from "./expected-date-editor";
import { TypeThemeEditor } from "./type-theme-editor";
import { NotesPanel } from "./notes-panel";
import { postComment } from "./actions";

const TABS: PipelineStage[] = [
  "ideate",
  "research",
  "script",
  "film",
  "edit",
  "package",
  "publish",
];

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab: PipelineStage = TABS.includes(tabParam as PipelineStage)
    ? (tabParam as PipelineStage)
    : "ideate";

  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);
  if (!currentTeam) notFound();

  const { data: project } = await supabase
    .from("long_video_projects")
    .select("*")
    .eq("id", id)
    .single();

  if (!project) notFound();

  const membership = await getMembership(supabase, currentTeam.id);
  const currentUser = await getCachedUser();
  const userIsMaster = isMaster(membership?.roles ?? []);

  const [{ data: titles }, { data: teamMembers }, { data: assigneeRows }, { data: comments }, { data: thumbnailRows }, { data: attachmentRows }] =
    await Promise.all([
      supabase
        .from("project_titles")
        .select("id, title, is_picked, position")
        .eq("project_id", id)
        .order("position"),
      supabase
        .from("team_members")
        .select("id, user_id, profiles(full_name, email), member_roles(role)")
        .eq("team_id", currentTeam.id)
        .eq("status", "active"),
      supabase
        .from("project_assignees")
        .select("id, stage, team_member_id, team_members(profiles(full_name))")
        .eq("project_id", id),
      supabase
        .from("project_comments")
        .select("id, stage, body, created_at, author_id")
        .eq("project_id", id)
        .order("created_at"),
      supabase
        .from("project_thumbnails")
        .select("id, storage_path, position")
        .eq("project_id", id)
        .order("position"),
      supabase
        .from("comment_attachments")
        .select("id, comment_id, file_name, file_path, file_size, mime_type, project_comments!inner(project_id)")
        .eq("project_comments.project_id", id),
    ]);

  const roleColors = await getRoleColors(supabase, currentTeam.id);

  const memberColors = ["#E8630D", "#178C7C", "#3159C9", "#6B4FD6", "#B84070", "#B4890E", "#2B9757"];
  const membersById = new Map(
    (teamMembers ?? []).map((m, i) => {
      const profile = m.profiles as unknown as { full_name: string | null; email: string | null } | null;
      const roles = (m.member_roles ?? []).map((r: { role: RoleId }) => r.role);
      return [
        m.id,
        {
          name: displayName(profile?.full_name, profile?.email),
          roles,
          color: memberColors[i % memberColors.length],
        },
      ];
    })
  );

  const peopleByUserId = new Map(
    (teamMembers ?? []).map((m) => {
      const profile = m.profiles as unknown as { full_name: string | null; email: string | null } | null;
      const roles = (m.member_roles ?? []).map((r: { role: RoleId }) => r.role);
      const name = displayName(profile?.full_name, profile?.email);
      return [m.user_id, { name, roles, color: colorForId(m.user_id) }];
    })
  );

  const thumbnailBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/thumbnails/`;
  const attachmentBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comment-attachments/`;
  const attachmentsByCommentId = new Map<string, { id: string; name: string; url: string; size: number; mimeType: string }[]>();
  (attachmentRows ?? []).forEach((a) => {
    const list = attachmentsByCommentId.get(a.comment_id) ?? [];
    list.push({
      id: a.id,
      name: a.file_name,
      url: attachmentBase + a.file_path,
      size: a.file_size,
      mimeType: a.mime_type,
    });
    attachmentsByCommentId.set(a.comment_id, list);
  });
  const thumbnails = (thumbnailRows ?? []).map((t) => ({
    id: t.id,
    path: t.storage_path,
    url: thumbnailBase + t.storage_path,
  }));

  const updatedByName = project.updated_by
    ? peopleByUserId.get(project.updated_by)?.name ?? null
    : null;

  const mentionCatalog = buildMentionCatalog(
    Array.from(peopleByUserId.entries()).map(([userId, info]) => ({ userId, name: info.name })),
    ROLES.map((r) => ({ id: r.id, name: r.name }))
  );

  const currentIndex = STAGE_ORDER.indexOf(project.stage as PipelineStage);
  const nextStage = STAGE_ORDER[currentIndex + 1];

  const assigneesForTab = (assigneeRows ?? [])
    .filter((a) => a.stage === tab)
    .map((a) => {
      const info = membersById.get(a.team_member_id);
      return {
        rowId: a.id,
        teamMemberId: a.team_member_id,
        name: info?.name ?? "Unknown",
        color: info?.color ?? "#999",
      };
    });

  const eligibleForTab = Array.from(membersById.entries())
    .filter(([, info]) => info.roles.some((r) => roleAllowsStage(r, tab)))
    .map(([teamMemberId, info]) => ({
      teamMemberId,
      name: info.name,
      roles: info.roles
        .map((r) => ROLES.find((role) => role.id === r)?.name)
        .join(", "),
    }));

  const commentsForTab = (comments ?? []).filter((c) => c.stage === tab);
  const canComment = canActOnStage(membership, tab);

  return (
    <div className="px-4 sm:px-10 py-5 sm:py-9 w-full max-w-[1400px] mx-auto">
      <Link
        href="/videos"
        className="text-sm text-ink-faint hover:text-ink mb-4 inline-block"
      >
        ← Long videos
      </Link>

      <div className="flex items-start justify-between gap-4 mb-2 flex-wrap">
        <h1 className="font-display text-3xl font-semibold max-w-xl leading-tight">
          {project.title}
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          {project.stage === "done" ? (
            <span className="text-[12px] font-bold px-2.5 py-1 rounded-full bg-amber/15 text-amber">
              Finished
            </span>
          ) : (
            userIsMaster && (
              <>
                {currentIndex > 0 && (
                  <RegressStageButton
                    projectId={project.id}
                    prevLabel={STAGE_LABELS[STAGE_ORDER[currentIndex - 1]]}
                  />
                )}
                {nextStage && (
                  <AdvanceStageButton
                    projectId={project.id}
                    nextLabel={STAGE_LABELS[nextStage as PipelineStage]}
                  />
                )}
              </>
            )
          )}
          {!userIsMaster && project.stage !== "done" && (
            <span className="text-[12px] text-ink-faint">
              Only the master can move this project
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <TypeThemeEditor
          projectId={id}
          teamId={currentTeam.id}
          videoType={project.video_type ?? []}
          theme={project.theme ?? ""}
          subtheme={project.subtheme}
          canEdit={canActOnStage(membership, "ideate")}
          color={stageColor(project.stage as PipelineStage)}
        />
        <ExpectedDateEditor
          projectId={id}
          teamId={currentTeam.id}
          date={project.expected_date}
          canEdit={canActOnStage(membership, "ideate")}
        />
      </div>

      {/* Stage tracker */}
      <div className="flex items-center mb-8 overflow-x-auto no-scrollbar pb-1">
        {STAGE_ORDER.map((s, i) => {
          const isDone = i < currentIndex;
          const isCurrent = i === currentIndex;
          const stepColor = isCurrent
            ? "rgb(var(--amber))"
            : stageColor(s);
          return (
            <div key={s} className="flex items-center flex-shrink-0">
              <div className="flex flex-col items-center gap-1.5 min-w-[74px]">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2"
                  style={{
                    borderColor: isDone || isCurrent ? stepColor : "rgb(var(--line) / 0.2)",
                    background: isDone || isCurrent ? stepColor : "transparent",
                    color: isDone || isCurrent ? "#fff" : "rgb(var(--ink-faint))",
                  }}
                >
                  {isDone ? "✓" : i + 1}
                </div>
                <span className={`text-[10px] font-bold ${isDone || isCurrent ? "text-ink" : "text-ink-faint"}`}>
                  {STAGE_LABELS[s]}
                </span>
              </div>
              {i < STAGE_ORDER.length - 1 && (
                <div
                  className="w-8 h-[2px] mb-4 flex-shrink-0"
                  style={{
                    background: i < currentIndex ? stageColor(s) : "rgb(var(--line) / 0.15)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-line/10 mb-6 overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/videos/${id}?tab=${t}`}
            className={`px-3 py-2.5 text-[13px] font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-amber text-amber"
                : "border-transparent text-ink-faint hover:text-ink"
            }`}
          >
            {STAGE_LABELS[t]}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        {/* Main tab content */}
        <div className="rounded-xl border border-line/10 bg-surface p-6">
          {tab === "ideate" ? (
            <div className="space-y-5">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint mb-2">
                  Titles
                </div>
                <TitleList
                  projectId={id}
                  teamId={currentTeam.id}
                  titles={titles ?? []}
                  canPick={userIsMaster}
                  canEditText={canActOnStage(membership, "ideate")}
                />
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint mb-2">
                  Hook
                </div>
                <InlineEditable
                  projectId={id}
                  teamId={currentTeam.id}
                  field="hook"
                  value={project.hook}
                  canEdit={canActOnStage(membership, "ideate")}
                  placeholder="What's the first thing said on screen?"
                  lastEditedAt={project.updated_at}
                  lastEditedBy={updatedByName}
                  emphasize
                />
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint mb-2">
                  Notes
                </div>
                <InlineEditable
                  projectId={id}
                  teamId={currentTeam.id}
                  field="notes"
                  value={project.notes}
                  canEdit={canActOnStage(membership, "ideate")}
                  placeholder="Add a note (optional)"
                />
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint mb-2">
                  Budget needed
                </div>
                <InlineEditable
                  projectId={id}
                  teamId={currentTeam.id}
                  field="budget_notes"
                  value={project.budget_notes}
                  canEdit={canActOnStage(membership, "ideate")}
                  placeholder="Add a rough budget estimate"
                />
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint mb-2">
                  Thumbnail sketches
                </div>
                <ThumbnailUploader
                  projectId={id}
                  thumbnails={thumbnails}
                  canEdit={canActOnStage(membership, "ideate")}
                />
              </div>
            </div>
          ) : (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint mb-2.5">
                Assigned — {STAGE_LABELS[tab]}
              </div>
              <AssigneeRow
                projectId={id}
                stage={tab}
                isMaster={userIsMaster}
                assignees={assigneesForTab}
                eligible={eligibleForTab}
              />
            </div>
          )}
        </div>

        <NotesPanel
          stageLabel={STAGE_LABELS[tab]}
          comments={commentsForTab.map((c) => {
            const person = peopleByUserId.get(c.author_id);
            return {
              id: c.id,
              name: person?.name ?? "Unknown",
              avatarColor: person?.color ?? "#999",
              roles: (person?.roles ?? []).map((r) => ({
                name: ROLES.find((role) => role.id === r)?.name ?? r,
                color: roleColors[r],
              })),
              createdAt: c.created_at,
              body: c.body,
              canDelete: userIsMaster || c.author_id === currentUser?.id,
              attachments: attachmentsByCommentId.get(c.id) ?? [],
            };
          })}
          canComment={canComment}
          projectId={id}
          postAction={postComment.bind(null, id, tab)}
          mentionCatalog={mentionCatalog}
          roleColors={roleColors}
        />
      </div>
    </div>
  );
}
