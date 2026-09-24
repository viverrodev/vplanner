"use client";

import { useEffect, useOptimistic, useState } from "react";
import { setShortPlatformPosted, setShortPostUrl } from "../actions";
import { useAction } from "@/lib/hooks/use-action";
import { ExternalIcon } from "@/components/ui/icons";
import { PLATFORM_META, type Platform } from "@/modules/short-videos/lib/constants";
import type { ShortPost } from "@/modules/short-videos/lib/queries";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { relativeTime } from "@/lib/relative-time";

/**
 * Where it's live. One row per planned platform: a switch to mark it
 * posted (masters/schedulers), who posted it and when, and an optional
 * link to the live post. All platforms marked → the short becomes Posted.
 */
export function PostingCard({
  id,
  platforms,
  posts,
  canPost,
  stageAllowsPosting,
}: {
  id: string;
  platforms: Platform[];
  posts: ShortPost[];
  canPost: boolean;
  stageAllowsPosting: boolean;
}) {
  const [shown, apply] = useOptimistic(
    posts,
    (state: ShortPost[], change: { platform: Platform; on: boolean }) =>
      change.on
        ? [...state.filter((p) => p.platform !== change.platform), { platform: change.platform, url: null, postedAt: new Date().toISOString(), postedBy: null }]
        : state.filter((p) => p.platform !== change.platform)
  );

  const toggle = useAction(setShortPlatformPosted, {
    optimistic: (_id, platform, on) => apply({ platform, on }),
    success: (_id, platform, on) => (on ? `Marked posted on ${PLATFORM_META[platform].name}` : `Unmarked ${PLATFORM_META[platform].name}`),
  });

  const done = platforms.filter((p) => shown.some((s) => s.platform === p)).length;
  const pct = platforms.length ? Math.round((done / platforms.length) * 100) : 0;
  const editable = canPost && stageAllowsPosting;

  return (
    <section className="rounded-2xl border border-line/10 bg-surface p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Posted</h2>
        <span className={`text-[12px] font-bold tabular-nums ${done === platforms.length ? "text-green" : done ? "text-amber" : "text-ink-faint"}`}>
          {done}/{platforms.length}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mb-4">
        <div className="h-full rounded-full bg-green transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>

      {!stageAllowsPosting && (
        <p className="text-[12px] text-ink-faint mb-3">Can be marked once the master approves it.</p>
      )}

      <div className="space-y-2">
        {platforms.map((p) => {
          const post = shown.find((s) => s.platform === p);
          const on = !!post;
          return (
            <div key={p} className={`rounded-xl border px-3 py-2.5 transition-colors ${on ? "border-green/30 bg-green/5" : "border-line/10"}`}>
              <div className="flex items-center gap-2.5">
                <PlatformIcon platform={p} className={`w-7 h-7 rounded-lg ${on ? "" : "grayscale opacity-40"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold">{PLATFORM_META[p].name}</div>
                  <div className="text-[11px] text-ink-faint truncate">
                    {on
                      ? post.postedBy
                        ? `Posted by ${post.postedBy.name} · ${relativeTime(post.postedAt)}`
                        : "Posted"
                      : "Not posted yet"}
                  </div>
                </div>
                {editable ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`Posted on ${PLATFORM_META[p].name}`}
                    onClick={() => toggle.run(id, p, !on)}
                    className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${on ? "bg-green" : "bg-line/20"}`}
                  >
                    <span className={`absolute top-0.5 left-0 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                  </button>
                ) : post?.url ? (
                  <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-ink-faint hover:text-ink" aria-label="Open live post">
                    <ExternalIcon className="w-4 h-4" />
                  </a>
                ) : null}
              </div>
              {on && editable && post.postedBy && <PostLinkInput id={id} platform={p} url={post.url} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PostLinkInput({ id, platform, url }: { id: string; platform: Platform; url: string | null }) {
  const [value, setValue] = useState(url ?? "");
  useEffect(() => setValue(url ?? ""), [url]);
  const save = useAction(setShortPostUrl, {
    success: "Link saved",
    onError: () => setValue(url ?? ""),
  });

  return (
    <div className="flex items-center gap-1.5 mt-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value.trim() !== (url ?? "") && save.run(id, platform, value)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        placeholder={`Link to the ${PLATFORM_META[platform].name} post (optional)`}
        className="flex-1 min-w-0 rounded-lg border border-line/15 bg-surface px-2.5 h-8 text-[12px] outline-none focus:ring-2 focus:ring-amber"
      />
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-ink-faint hover:text-ink hover:bg-surface-2" aria-label="Open live post">
          <ExternalIcon className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}
