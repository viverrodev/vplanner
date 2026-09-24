import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/permissions/membership";
import { ArrowLeftIcon, CheckIcon, AlertIcon } from "@/components/ui/icons";
import { ScrollToCurrent } from "@/components/ui/scroll-to-current";
import {
  getShortDetail,
  getShortSettings,
  listDayLimits,
  listPlannedDates,
  listTeamPeople,
} from "@/modules/short-videos/lib/queries";
import { shortPermissions } from "@/modules/short-videos/lib/permissions";
import { SHORT_STAGES, SHORT_STAGE_LABELS } from "@/modules/short-videos/lib/constants";
import { STAGE_STATE_COLOR } from "@/modules/long-videos/lib/stages";
import { formatShortDate, isOverdue, relativeDay } from "@/modules/short-videos/lib/dates";
import { ShortStagePill } from "@/modules/short-videos/components/stage-pill";
import { ShortsRealtime } from "@/modules/short-videos/components/shorts-realtime";
import { ShortTitle } from "./short-title";
import { DeleteShortButton } from "./delete-short-button";
import { WorkflowActions } from "./workflow-actions";
import { DetailsCard } from "./details-card";
import { PostingCard } from "./posting-card";
import { ActivityCard } from "./activity-card";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const short = await getShortDetail(id);
  return { title: short ? `#${short.number} ${short.title}` : "Short" };
}

export default async function ShortPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const short = await getShortDetail(id);
  if (!short) notFound();

  const supabase = await createClient();
  const membership = await getMembership(supabase, short.teamId);
  const roles = membership?.roles ?? [];
  const isAssignedEditor = !!membership && short.editor?.memberId === membership.teamMemberId;
  const isAssignedReviewer = !!membership && short.reviewer?.memberId === membership.teamMemberId;
  const perms = shortPermissions({ roles, isAssignedEditor, isAssignedReviewer, stage: short.stage });

  const [people, planned, settings, limits] = await Promise.all([
    perms.canAssignPeople ? listTeamPeople(short.teamId) : Promise.resolve([]),
    perms.canEditBasics ? listPlannedDates(short.teamId) : Promise.resolve([]),
    getShortSettings(short.teamId),
    perms.canEditBasics ? listDayLimits(short.teamId) : Promise.resolve({}),
  ]);

  const currentIndex = SHORT_STAGES.indexOf(short.stage);
  const overdue = isOverdue(short.plannedDate, short.stage);
  const rel = relativeDay(short.plannedDate);

  return (
    <div className="px-4 sm:px-10 py-5 sm:py-9 w-full max-w-[1200px] mx-auto">
      <ShortsRealtime teamId={short.teamId} shortId={short.id} />

      <Link href="/shorts" className="inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink mb-4">
        <ArrowLeftIcon className="w-3.5 h-3.5" />
        Short videos
      </Link>

      <div className="flex items-start gap-3 mb-2">
        <ShortTitle id={short.id} number={short.number} title={short.title} canEdit={perms.canEditBasics} />
        {perms.canDelete && (
          <div className="flex-shrink-0 pt-0.5">
            <DeleteShortButton id={short.id} number={short.number} title={short.title} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-5 text-[13px] text-ink-soft">
        <ShortStagePill stage={short.stage} size="md" />
        {short.plannedDate ? (
          <span className={overdue ? "text-red font-semibold" : ""}>
            {overdue && <AlertIcon className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />}
            Planned {formatShortDate(short.plannedDate)}
            {rel ? ` · ${rel}` : ""}
            {overdue ? " · overdue" : ""}
          </span>
        ) : (
          <span className="text-ink-faint">No planned date</span>
        )}
        <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
          {short.scheduleMode === "auto" ? "Auto date" : short.pinKind === "oneoff" ? "Fixed · just this one" : "Fixed · queue starts here"}
        </span>
        {short.createdBy && <span className="text-ink-faint">Created by {short.createdBy.name}</span>}
      </div>

      {/* Stage tracker — same state colors as long videos */}
      <ScrollToCurrent className="flex items-center mb-6 overflow-x-auto no-scrollbar pb-1">
        {SHORT_STAGES.map((s, i) => {
          const allDone = short.stage === "posted";
          const state = allDone || i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
          const c = STAGE_STATE_COLOR[state];
          const on = state !== "upcoming";
          return (
            <div key={s} className="flex items-center flex-shrink-0" data-current={state === "current" ? "true" : undefined}>
              <div className="flex flex-col items-center gap-1.5 min-w-[78px]">
                <div
                  className={`rounded-full flex items-center justify-center font-bold border-2 ${
                    state === "current" ? "w-8 h-8 text-[12px] current-stage-pulse" : "w-7 h-7 text-[11px]"
                  }`}
                  style={{
                    borderColor: on ? c : "rgb(var(--line) / 0.2)",
                    background: on ? c : "transparent",
                    color: on ? "#fff" : "rgb(var(--ink-faint))",
                  }}
                >
                  {state === "done" ? <CheckIcon className="w-4 h-4" /> : i + 1}
                </div>
                <span className={`text-[10.5px] font-bold whitespace-nowrap ${on ? "text-ink" : "text-ink-faint"}`}>
                  {SHORT_STAGE_LABELS[s]}
                </span>
              </div>
              {i < SHORT_STAGES.length - 1 && (
                <div
                  className="w-6 sm:w-10 h-[2px] mb-5"
                  style={{ background: allDone || i + 1 <= currentIndex ? STAGE_STATE_COLOR.done : "rgb(var(--line) / 0.15)" }}
                />
              )}
            </div>
          );
        })}
      </ScrollToCurrent>

      <WorkflowActions
        id={short.id}
        number={short.number}
        stage={short.stage}
        perms={perms}
        hasEditor={!!short.editor}
        editorName={short.editor?.name ?? null}
        reviewerName={short.reviewer?.name ?? null}
      />

      {short.stage === "editing" && short.reviewNote && (
        <div className="mb-6 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 max-w-3xl">
          <div className="text-[11px] font-bold uppercase tracking-wide text-amber mb-1">Changes requested</div>
          <p className="text-[13.5px] whitespace-pre-wrap">{short.reviewNote}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6">
        <div className="space-y-6 min-w-0">
          <section className="rounded-2xl border border-dashed border-line/20 bg-surface/50 px-5 py-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint mb-1">Script</div>
            <p className="text-[13px] text-ink-soft">
              The script editor is coming in the next update — writing, highlights, images and DOCX/PDF export,
              right here on this page.
            </p>
          </section>

          <DetailsCard
            id={short.id}
            perms={perms}
            plannedDate={short.plannedDate}
            scheduleMode={short.scheduleMode}
            pinKind={short.pinKind}
            perDay={settings.perDay}
            weekends={settings.weekends}
            limits={limits}
            editor={short.editor}
            reviewer={short.reviewer}
            scheduler={short.scheduler}
            platforms={short.platforms}
            fileLink={short.fileLink}
            caption={short.caption}
            people={people}
            planned={planned}
          />
        </div>

        <div className="space-y-6">
          <PostingCard
            id={short.id}
            platforms={short.platforms}
            posts={short.posts}
            canPost={perms.isMaster || roles.includes("publisher")}
            stageAllowsPosting={short.stage === "ready" || short.stage === "posted"}
          />
          <ActivityCard events={short.events} />
        </div>
      </div>
    </div>
  );
}
