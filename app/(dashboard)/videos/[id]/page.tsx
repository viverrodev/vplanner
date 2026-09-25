import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership, canActOnStage } from "@/lib/permissions/membership";
import { isMaster, roleAllowsStage, ROLES } from "@/lib/permissions/roles";
import type { PipelineStage, RoleId } from "@/lib/permissions/roles";
import { STAGE_LABELS, STAGE_ORDER, STAGE_STATE_COLOR, stageState } from "@/modules/long-videos/lib/stages";
import { getCachedUser } from "@/lib/supabase/get-user";
import { colorForId, displayName } from "@/lib/avatar";
import { getRoleColors } from "@/lib/permissions/team-role-colors";
import { buildMentionCatalog } from "@/lib/mentions";
import { CheckIcon, ArrowLeftIcon } from "@/components/ui/icons";
import { AdvanceStageButton, RegressStageButton } from "./advance-button";
import { AssigneeRow } from "./assignee-row";
import { TitleList } from "./title-list";
import { ThumbnailUploader } from "./thumbnail-uploader";
import { InlineEditable } from "./inline-editable";
import { ExpectedDateEditor } from "./expected-date-editor";
import { TypeThemeEditor } from "./type-theme-editor";
import { NotesPanel } from "./notes-panel";
import { DeleteProjectButton } from "./delete-project-button";
import { postComment } from "./actions";
import type { Metadata } from "next";
import { getProject } from "@/modules/long-videos/lib/queries";
import { LinkPendingIndicator } from "@/components/ui/link-pending";
import { ScrollToCurrent } from "@/components/ui/scroll-to-current";

const TABS: PipelineStage[] = [
  "ideate",
  "research",
  "script",
  "film",
  "edit",
  "package",
  "publish",
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const project = await getProject(id);
  return { title: project?.title ?? "Project" };
}

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

  // The project decides which team we're looking at — NOT the workspace
  // switcher. (Opening a notification for a project in another team
  // used to evaluate your roles against the wrong team.)
  const [project, currentUser] = await Promise.all([getProject(id), getCachedUser()]);
  if (!project) notFound();
  const teamId: string = project.team_id;

  // Everything below depends only on the project id / team id, so it all
  // runs in parallel — one round of waiting instead of a chain.
  const [
    membership,
    roleColors,
    { data: titles },
    { data: teamMembers },
    { data: assigneeRows },
    { data: comments },
    { data: thumbnailRows },
    { data: attachmentRows },
    { data: otherDated },
  ] = await Promise.all([
    getMembership(supabase, teamId),
    getRoleColors(supabase, teamId),
    supabase
      .from("project_titles")
      .select("id, title, is_picked, position")
      .eq("project_id", id)
      .order("position"),
    supabase
      .from("team_members")
      .select("id, user_id, profiles(username, full_name, email, avatar_url), member_roles(role)")
      .eq("team_id", teamId)
      .eq("status", "active"),
    supabase
      .from("project_assignees")
      .select("id, stage, team_member_id")
      .eq("project_id", id),
    // Only the open tab's notes (+ their attachments) — not every stage's.
    supabase
      .from("project_comments")
      .select("id, stage, body, created_at, author_id")
      .eq("project_id", id)
      .eq("stage", tab)
      .order("created_at"),
    supabase
      .from("project_thumbnails")
      .select("id, storage_path, position")
      .eq("project_id", id)
      .order("position"),
    supabase
      .from("comment_attachments")
      .select("id, comment_id, file_name, file_path, file_size, mime_type, project_comments!inner(project_id, stage)")
      .eq("project_comments.project_id", id)
      .eq("project_comments.stage", tab),
    // Other long videos' dates — dots in the date picker.
    supabase
      .from("long_video_projects")
      .select("expected_date")
      .eq("team_id", teamId)
      .neq("id", id)
      .not("expected_date", "is", null),
  ]);

  const userIsMaster = isMaster(membership?.roles ?? []);

  const memberColors = ["#E8630D", "#178C7C", "#3159C9", "#6B4FD6", "#B84070", "#B4890E", "#2B9757"];
  const membersById = new Map(
    (teamMembers ?? []).map((m, i) => {
      const profile = m.profiles as unknown as { username: string | null; full_name: string | null; email: string | null; avatar_url: string | null } | null;
      const roles = (m.member_roles ?? []).map((r: { role: RoleId }) => r.role);
      return [
        m.id,
        {
          name: displayName(profile?.username, profile?.full_name, profile?.email),
          roles,
          color: memberColors[i % memberColors.length],
        },
      ];
    })
  );

  const roleOrder = (r: RoleId) => ROLES.findIndex((x) => x.id === r);
  const peopleByUserId = new Map(
    (teamMembers ?? []).map((m) => {
      const profile = m.profiles as unknown as { username: string | null; full_name: string | null; email: string | null; avatar_url: string | null } | null;
      // Canonical order (Master first, then pipeline order) so the two
      // pills shown in chat are always the most meaningful ones.
      const roles = (m.member_roles ?? [])
        .map((r: { role: RoleId }) => r.role)
        .sort((a: RoleId, b: RoleId) => roleOrder(a) - roleOrder(b));
      const name = displayName(profile?.username, profile?.full_name, profile?.email);
      return [m.user_id, { name, roles, color: colorForId(m.user_id), avatarUrl: profile?.avatar_url ?? null }];
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
      url: a.file_path.startsWith("http") ? a.file_path : attachmentBase + a.file_path,
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
      color: info.color,
      roles: info.roles
        .map((r) => ROLES.find((role) => role.id === r)?.name)
        .join(", "),
    }));

  const commentsForTab = (comments ?? []).filter((c) => c.stage === tab);
  // Ideate is the team's brainstorm — every member can post there. Other
  // stages: people with a role for that stage, or a Master (same rule
  // the database enforces, migration 0025).
  const canComment = tab === "ideate" ? !!membership : canActOnStage(membership, tab);

  return (
    <div className="px-4 sm:px-10 py-5 sm:py-9 w-full max-w-[1400px] mx-auto">
      <Link
        href="/videos"
        className="flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink mb-4"
      >
        <ArrowLeftIcon className="w-3.5 h-3.5" />
        Long videos
      </Link>

      {/* Title row: number + title, delete tucked away on the right */}
      <div className="flex items-start gap-3 mb-1.5">
        <h1 className="flex-1 min-w-0 font-display text-[26px] sm:text-3xl font-semibold leading-tight">
          <span className="font-mono text-[15px] sm:text-[17px] font-semibold text-ink-faint align-middle mr-2 tabular-nums">
            #{project.entry_number}
          </span>
          {project.title}
        </h1>
        {userIsMaster && (
          <div className="flex-shrink-0 pt-0.5">
            <DeleteProjectButton projectId={id} teamId={teamId} projectTitle={project.title} />
          </div>
        )}
      </div>

      {/* Quiet metadata line */}
      <div className="flex flex-wrap items-center gap-x-0.5 gap-y-1 -ml-2 mb-4">
        <TypeThemeEditor
          projectId={id}
          teamId={teamId}
          videoType={project.video_type ?? []}
          theme={project.theme ?? ""}
          subtheme={project.subtheme}
          canEdit={canActOnStage(membership, "ideate")}
          color={colorForId(project.theme || "theme")}
        />
        <span className="text-ink-faint/50 text-[13px]" aria-hidden>·</span>
        <ExpectedDateEditor
          projectId={id}
          teamId={teamId}
          date={project.expected_date}
          canEdit={canActOnStage(membership, "ideate")}
          otherDates={(otherDated ?? []).map((r) => r.expected_date as string)}
        />
      </div>

      {/* Stage actions */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        {project.stage === "done" ? (
          <span className="text-[12px] font-bold px-2.5 py-1 rounded-full bg-teal/15 text-teal">
            Finished
          </span>
        ) : userIsMaster ? (
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
        ) : (
          <span className="text-[12px] text-ink-faint">Only the master can move this project</span>
        )}
      </div>

      {/* Stage tracker */}
      <ScrollToCurrent className="flex items-center mb-8 overflow-x-auto no-scrollbar pb-1 scroll-smooth">
        {STAGE_ORDER.map((s, i) => {
          const state = stageState(s, project.stage as PipelineStage);
          const isDone = state === "done";
          const isCurrent = state === "current";
          const stepColor = STAGE_STATE_COLOR[state];
          return (
            <div key={s} className="flex items-center flex-shrink-0" data-current={isCurrent ? "true" : undefined}>
              <div className="flex flex-col items-center gap-1.5 min-w-[74px]">
                <div
                  className={`rounded-full flex items-center justify-center font-bold border-2 transition-all ${
                    isCurrent ? "w-8 h-8 text-[12px] current-stage-pulse" : "w-7 h-7 text-[11px]"
                  }`}
                  style={{
                    borderColor: isDone || isCurrent ? stepColor : "rgb(var(--line) / 0.2)",
                    background: isDone || isCurrent ? stepColor : "transparent",
                    color: isDone || isCurrent ? "#fff" : "rgb(var(--ink-faint))",
                  }}
                >
                  {isDone ? <CheckIcon className="w-4 h-4" /> : i + 1}
                </div>
                <span className={`text-[10px] font-bold ${isDone || isCurrent ? "text-ink" : "text-ink-faint"}`}>
                  {STAGE_LABELS[s]}
                </span>
              </div>
              {i < STAGE_ORDER.length - 1 && (
                <div
                  className="w-8 h-[2px] mb-4 flex-shrink-0"
                  style={{
                    background:
                      stageState(STAGE_ORDER[i + 1], project.stage as PipelineStage) !== "upcoming"
                        ? STAGE_STATE_COLOR.done
                        : "rgb(var(--line) / 0.15)",
                  }}
                />
              )}
            </div>
          );
        })}
      </ScrollToCurrent>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-line/10 mb-6 overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/videos/${id}?tab=${t}`}
            scroll={false}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-amber text-amber"
                : "border-transparent text-ink-faint hover:text-ink"
            }`}
          >
            {STAGE_LABELS[t]}
            <LinkPendingIndicator />
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
                  teamId={teamId}
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
                  teamId={teamId}
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
                  teamId={teamId}
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
                  teamId={teamId}
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
                Assigned · {STAGE_LABELS[tab]}
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
              avatarUrl: person?.avatarUrl ?? null,
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
          me={(() => {
            const self = currentUser ? peopleByUserId.get(currentUser.id) : undefined;
            if (!currentUser || !self) return null;
            return {
              id: currentUser.id,
              name: self.name,
              avatarColor: self.color,
              avatarUrl: self.avatarUrl,
              roles: self.roles.map((r) => ({
                name: ROLES.find((role) => role.id === r)?.name ?? r,
                color: roleColors[r],
              })),
            };
          })()}
        />
      </div>
    </div>
  );
}
