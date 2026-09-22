import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership, canActOnStage } from "@/lib/permissions/membership";
import { isMaster, roleAllowsStage, ROLES } from "@/lib/permissions/roles";
import type { PipelineStage, RoleId } from "@/lib/permissions/roles";
import { STAGE_LABELS, STAGE_ORDER, stageColor } from "@/modules/long-videos/lib/stages";
import { colorForId, initialsFor, displayName } from "@/lib/avatar";
import { getRoleColors } from "@/lib/permissions/team-role-colors";
import { relativeTime } from "@/lib/relative-time";
import { AdvanceStageButton, RegressStageButton } from "./advance-button";
import { AssigneeRow } from "./assignee-row";
import { TitleList } from "./title-list";
import { ThumbnailUploader } from "./thumbnail-uploader";
import { InlineEditable } from "./inline-editable";
import { ExpectedDateEditor } from "./expected-date-editor";
import { CommentDeleteButton } from "./comment-delete-button";
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
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();
  const userIsMaster = isMaster(membership?.roles ?? []);

  const [{ data: titles }, { data: teamMembers }, { data: assigneeRows }, { data: comments }, { data: thumbnailRows }] =
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
  const thumbnails = (thumbnailRows ?? []).map((t) => ({
    id: t.id,
    path: t.storage_path,
    url: thumbnailBase + t.storage_path,
  }));

  const updatedByName = project.updated_by
    ? peopleByUserId.get(project.updated_by)?.name ?? null
    : null;

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
    <div className="px-10 py-9 w-full max-w-[1400px] mx-auto">
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
      <p className="text-[13px] mb-2">
        {project.video_type?.join(" + ")}{" "}
        <span className="font-bold" style={{ color: stageColor(project.stage as PipelineStage) }}>
          {project.theme}
          {project.subtheme ? ` · ${project.subtheme}` : ""}
        </span>
      </p>
      <div className="mb-6">
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

        {/* Notes & Q&A panel — same pattern at every stage */}
        <div className="rounded-xl border border-line/10 bg-surface p-4 h-fit">
          <div className="text-[13px] font-display font-semibold mb-3">
            Notes & Q&A — {STAGE_LABELS[tab]}
          </div>
          <div className="space-y-3 mb-3 max-h-[360px] overflow-y-auto">
            {commentsForTab.length === 0 && (
              <p className="text-[12px] text-ink-faint">
                No notes on this stage yet.
              </p>
            )}
            {commentsForTab.map((c) => {
              const person = peopleByUserId.get(c.author_id);
              const name = person?.name ?? "Unknown";
              const canDelete = userIsMaster || c.author_id === currentUser?.id;
              return (
                <div key={c.id} className="flex gap-2 border-b border-line/10 pb-2.5 last:border-none">
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 mt-0.5"
                    style={{ background: person?.color ?? "#999" }}
                  >
                    {initialsFor(name)}
                  </span>
                  <div className="text-[12.5px] min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold">{name}</span>
                      {(person?.roles ?? []).map((r) => {
                        const roleInfo = ROLES.find((role) => role.id === r);
                        const rc = roleColors[r];
                        return (
                          <span
                            key={r}
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded border"
                            style={{
                              color: rc,
                              borderColor: `color-mix(in srgb, ${rc} 45%, transparent)`,
                              background: `color-mix(in srgb, ${rc} 12%, transparent)`,
                            }}
                          >
                            {roleInfo?.name}
                          </span>
                        );
                      })}
                      <span className="text-[10.5px] text-ink-soft ml-auto">
                        {relativeTime(c.created_at)}
                      </span>
                      {canDelete && (
                        <CommentDeleteButton commentId={c.id} projectId={id} />
                      )}
                    </div>
                    <div className="text-ink-soft leading-relaxed mt-0.5">{c.body}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {canComment ? (
            <form action={postComment.bind(null, id, tab)} className="flex gap-1.5">
              <input
                name="body"
                type="text"
                placeholder="Leave a note…"
                required
                className="flex-1 rounded-lg border border-line/15 bg-surface-2 px-2.5 py-1.5 text-[12.5px] outline-none focus:ring-2 focus:ring-amber"
              />
              <button
                type="submit"
                className="rounded-lg bg-amber text-white text-[12px] font-semibold px-3 py-1.5"
              >
                Send
              </button>
            </form>
          ) : (
            <p className="text-[11px] text-ink-faint">
              Only people tagged on this stage (or the master) can post notes
              here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
