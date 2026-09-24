import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import {
  STAGE_LABELS,
  STAGE_ORDER,
  stageColor,
  formatDate,
} from "@/modules/long-videos/lib/stages";
import type { PipelineStage } from "@/lib/permissions/roles";
import { colorForId } from "@/lib/avatar";
import { GridIcon, ListIcon } from "@/components/ui/icons";
import { setViewMode } from "./view-mode-actions";
import { VIEW_MODE_COOKIE } from "@/lib/view-mode";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Long videos" };

export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; view?: string }>;
}) {
  const { stage: stageFilter, view } = await searchParams;
  const cookieStore = await cookies();
  const savedView = cookieStore.get(VIEW_MODE_COOKIE)?.value;
  // An explicit ?view= in the URL wins (so a shared/bookmarked link still
  // works as expected); otherwise fall back to whatever was saved last.
  const isTable = view ? view === "table" : savedView === "table";
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);

  if (!currentTeam) {
    return (
      <div className="p-8 text-sm text-ink-soft">
        Create a team first from the sidebar.
      </div>
    );
  }

  let query = supabase
    .from("long_video_projects")
    .select(
      "id, title, stage, expected_date, theme, subtheme, video_type, project_thumbnails(storage_path, position)"
    )
    .eq("team_id", currentTeam.id)
    .order("created_at", { ascending: false })
    // Only the cover thumbnail per project — not every thumbnail idea.
    .order("position", { referencedTable: "project_thumbnails", ascending: true })
    .limit(1, { referencedTable: "project_thumbnails" });

  if (stageFilter && STAGE_ORDER.includes(stageFilter as PipelineStage)) {
    query = query.eq("stage", stageFilter);
  }

  const { data: projects } = await query;
  const thumbnailBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/thumbnails/`;

  return (
    <div className="px-4 sm:px-10 py-5 sm:py-9 w-full max-w-[1720px] mx-auto">
      <div className="flex items-start justify-between gap-6 mb-7 flex-wrap">
        <div>
          <h1 className="font-display text-[40px] leading-none font-semibold mb-2.5">
            Long-form videos
          </h1>
          <p className="text-[15px] text-ink-soft">
            {currentTeam.name}&rsquo;s video pipeline, ideate through publish.
          </p>
        </div>
        <Link
          href="/videos/new"
          className="flex-shrink-0 inline-flex items-center rounded-xl bg-amber text-white font-bold px-6 py-3.5 text-[15px] shadow-[0_4px_0_0_rgb(var(--amber)/0.5)] hover:brightness-105 active:translate-y-[2px] active:shadow-none transition-all"
        >
          + New project
        </Link>
      </div>

      {/* Filters — small, low-key, border-led rather than solid fills — with the view toggle on the same row, opposite side */}
      <div className="flex items-center justify-between gap-3 mb-7 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
        <Link
          href={`/videos${isTable ? "?view=table" : ""}`}
          className={`rounded-full px-3 py-1 text-[11.5px] font-bold border transition-colors ${
            !stageFilter
              ? "border-ink text-ink"
              : "border-line/15 text-ink-faint hover:border-line/30"
          }`}
        >
          All
        </Link>
        {STAGE_ORDER.map((s) => {
          const active = stageFilter === s;
          const c = stageColor(s);
          const href = `/videos?stage=${s}${isTable ? "&view=table" : ""}`;
          return (
            <Link
              key={s}
              href={href}
              className="rounded-full px-3 py-1 text-[11.5px] font-bold border transition-colors flex items-center gap-1.5"
              style={{
                borderColor: active ? c : `color-mix(in srgb, ${c} 30%, transparent)`,
                color: c,
                background: active ? `color-mix(in srgb, ${c} 12%, transparent)` : "transparent",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c }} />
              {STAGE_LABELS[s]}
            </Link>
          );
        })}
        </div>

        <div className="flex items-center rounded-lg border border-line/15 p-0.5 flex-shrink-0">
          <form action={setViewMode}>
            <input type="hidden" name="mode" value="grid" />
            <input type="hidden" name="stage" value={stageFilter ?? ""} />
            <button
              type="submit"
              aria-label="Card view"
              className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                !isTable ? "bg-surface-2 text-ink" : "text-ink-faint hover:text-ink"
              }`}
            >
              <GridIcon className="w-[15px] h-[15px]" />
            </button>
          </form>
          <form action={setViewMode}>
            <input type="hidden" name="mode" value="table" />
            <input type="hidden" name="stage" value={stageFilter ?? ""} />
            <button
              type="submit"
              aria-label="Table view"
              className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                isTable ? "bg-surface-2 text-ink" : "text-ink-faint hover:text-ink"
              }`}
            >
              <ListIcon className="w-[15px] h-[15px]" />
            </button>
          </form>
        </div>
      </div>

      {!projects || projects.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-line/15 py-24 text-center text-[15px] text-ink-faint">
          No projects{stageFilter ? " in this stage" : " yet"}.
        </div>
      ) : isTable ? (
        <div className="rounded-xl border border-line/10 overflow-hidden">
          <div className="grid grid-cols-[56px_1fr] sm:grid-cols-[64px_1fr_110px_160px_110px_110px] gap-3 px-3 py-2 bg-surface-2 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
            <span></span>
            <span>Title</span>
            <span className="hidden sm:block">Type</span>
            <span className="hidden sm:block">Theme</span>
            <span className="hidden sm:block">Stage</span>
            <span className="hidden sm:block">Expected</span>
          </div>
          {projects.map((p) => {
            const thumbs = (p.project_thumbnails ?? []).sort((a, b) => a.position - b.position);
            const cover = thumbs[0];
            const c = stageColor(p.stage as PipelineStage);
            const themeColor = colorForId(p.theme || "theme");
            return (
              <Link
                key={p.id}
                href={`/videos/${p.id}`}
                className="grid grid-cols-[56px_1fr] sm:grid-cols-[64px_1fr_110px_160px_110px_110px] gap-3 px-3 py-2 items-center border-t border-line/10 hover:bg-surface-2 transition-colors"
              >
                <span
                  className="w-14 h-8 rounded-md overflow-hidden flex-shrink-0"
                  style={{
                    background: cover
                      ? undefined
                      : `linear-gradient(135deg, color-mix(in srgb, ${c} 30%, transparent), color-mix(in srgb, ${c} 8%, transparent))`,
                  }}
                >
                  {cover && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img loading="lazy" decoding="async" src={thumbnailBase + cover.storage_path} alt="" className="w-full h-full object-cover" />
                  )}
                </span>
                <span className="text-[13px] font-semibold truncate">{p.title}</span>
                <span className="hidden sm:block text-[11.5px] text-ink-soft truncate">
                  {(p.video_type ?? []).join(" + ") || "—"}
                </span>
                <span className="hidden sm:block text-[12px] font-semibold truncate" style={{ color: themeColor }}>
                  {p.theme}
                  {p.subtheme ? ` · ${p.subtheme}` : ""}
                </span>
                <span className="hidden sm:block">
                  <span
                    className="text-[10.5px] font-bold px-2 py-0.5 rounded-full"
                    style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}
                  >
                    {STAGE_LABELS[p.stage as PipelineStage]}
                  </span>
                </span>
                <span className="hidden sm:block text-[11.5px] font-mono text-ink-soft">{formatDate(p.expected_date)}</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
          {projects.map((p) => {
            const thumbs = (p.project_thumbnails ?? []).sort((a, b) => a.position - b.position);
            const cover = thumbs[0];
            const c = stageColor(p.stage as PipelineStage);
            return (
              <Link
                key={p.id}
                href={`/videos/${p.id}`}
                className="group rounded-2xl border-2 border-line/10 bg-surface overflow-hidden hover:border-amber hover:shadow-[0_8px_24px_-8px_rgb(var(--amber)/0.35)] hover:-translate-y-0.5 transition-all flex flex-col"
              >
                <div
                  className="aspect-video relative overflow-hidden"
                  style={{
                    background: cover
                      ? undefined
                      : `linear-gradient(135deg, color-mix(in srgb, ${c} 30%, transparent), color-mix(in srgb, ${c} 8%, transparent))`,
                  }}
                >
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img loading="lazy" decoding="async"
                      src={thumbnailBase + cover.storage_path}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-[13px] font-bold" style={{ color: c }}>
                        No thumbnail yet
                      </span>
                    </div>
                  )}
                  <span
                    className="absolute top-2.5 left-2.5 text-[11px] font-bold px-2.5 py-1 rounded-full text-white shadow-sm"
                    style={{ background: c }}
                  >
                    {STAGE_LABELS[p.stage as PipelineStage]}
                  </span>
                </div>
                <div className="p-4 flex flex-col gap-2 flex-1">
                  <span className="font-semibold text-[15px] leading-snug">{p.title}</span>
                  {(p.video_type ?? []).length > 0 && (
                    <span className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
                      {(p.video_type ?? []).join(" + ")}
                    </span>
                  )}
                  <div className="text-[12px] text-ink-faint flex items-center justify-between">
                    <span className="font-semibold" style={{ color: colorForId(p.theme || "theme") }}>
                      {p.theme}
                      {p.subtheme ? ` · ${p.subtheme}` : ""}
                    </span>
                  </div>
                  <div
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 -mx-0.5 mt-auto"
                    style={{ background: "rgb(var(--amber) / 0.12)" }}
                  >
                    <span className="text-amber text-[12px]">📅</span>
                    <span className="font-bold text-[12.5px] text-amber">{formatDate(p.expected_date)}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
