import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import {
  STAGE_LABELS,
  STAGE_ORDER,
  stageColor,
  formatDate,
} from "@/modules/long-videos/lib/stages";
import type { PipelineStage } from "@/lib/permissions/roles";

export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { stage: stageFilter } = await searchParams;
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
      "id, title, stage, expected_date, theme, subtheme, project_thumbnails(storage_path, position)"
    )
    .eq("team_id", currentTeam.id)
    .order("created_at", { ascending: false });

  if (stageFilter && STAGE_ORDER.includes(stageFilter as PipelineStage)) {
    query = query.eq("stage", stageFilter);
  }

  const { data: projects } = await query;
  const thumbnailBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/thumbnails/`;

  return (
    <div className="px-10 py-9 w-full max-w-[1720px] mx-auto">
      <div className="flex items-start justify-between gap-6 mb-8 flex-wrap">
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

      <div className="flex flex-wrap gap-2 mb-9">
        <Link
          href="/videos"
          className={`rounded-full px-4 py-2 text-[13px] font-bold border-2 transition-colors ${
            !stageFilter
              ? "bg-ink border-ink text-paper"
              : "border-line/15 text-ink-soft hover:border-line/30"
          }`}
        >
          All
        </Link>
        {STAGE_ORDER.map((s) => {
          const active = stageFilter === s;
          const c = stageColor(s);
          return (
            <Link
              key={s}
              href={`/videos?stage=${s}`}
              className="rounded-full px-4 py-2 text-[13px] font-bold border-2 transition-colors flex items-center gap-2"
              style={
                active
                  ? { background: c, borderColor: c, color: "#fff" }
                  : {
                      borderColor: `color-mix(in srgb, ${c} 35%, transparent)`,
                      color: c,
                    }
              }
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: active ? "#fff" : c }}
              />
              {STAGE_LABELS[s]}
            </Link>
          );
        })}
      </div>

      {projects && projects.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
          {projects.map((p) => {
            const thumbs = (p.project_thumbnails ?? []).sort(
              (a, b) => a.position - b.position
            );
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
                    <img
                      src={thumbnailBase + cover.storage_path}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span
                        className="text-[13px] font-bold"
                        style={{ color: c }}
                      >
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
                <div className="p-4 flex flex-col gap-2.5 flex-1">
                  <span className="font-semibold text-[15px] leading-snug">
                    {p.title}
                  </span>
                  <div className="text-[12px] text-ink-faint flex items-center justify-between mt-auto pt-1">
                    <span className="font-semibold" style={{ color: c }}>
                      {p.theme}
                      {p.subtheme ? ` · ${p.subtheme}` : ""}
                    </span>
                  </div>
                  <div
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 -mx-0.5"
                    style={{ background: "rgb(var(--amber) / 0.12)" }}
                  >
                    <span className="text-amber text-[12px]">📅</span>
                    <span className="font-bold text-[12.5px] text-amber">
                      {formatDate(p.expected_date)}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-line/15 py-24 text-center text-[15px] text-ink-faint">
          No projects{stageFilter ? " in this stage" : " yet"}.
        </div>
      )}
    </div>
  );
}
