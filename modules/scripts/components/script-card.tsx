import Link from "next/link";
import { relativeTime } from "@/lib/relative-time";
import { ArrowRightIcon, DocumentIcon } from "@/components/ui/icons";
import { spokenLength } from "../lib/text";
import type { ScriptRow } from "../lib/queries";

/** The script at a glance on a video's page, with a way into the editor. */
export function ScriptCard({
  href,
  script,
  canEdit,
  prominent,
}: {
  href: string;
  script: ScriptRow | null;
  canEdit: boolean;
  /** Script stage: make it the obvious next thing. */
  prominent: boolean;
}) {
  const hasText = !!script && script.wordCount > 0;
  const preview = script?.text.replace(/\s+/g, " ").trim().slice(0, 220) ?? "";

  return (
    <section
      className={`rounded-2xl bg-surface p-4 sm:p-5 ${prominent ? "border-2 border-amber" : "border border-line/10"}`}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className={`text-[11px] font-bold uppercase tracking-wide ${prominent ? "text-amber" : "text-ink-soft"}`}>Script</h2>
        {hasText && (
          <span className="text-[12px] text-ink-soft tabular-nums">
            {script!.wordCount} words · about {spokenLength(script!.wordCount)}
          </span>
        )}
      </div>

      {hasText ? (
        <p className="text-[13.5px] text-ink leading-relaxed line-clamp-3">
          {preview}
          {script!.text.length > 220 ? "…" : ""}
        </p>
      ) : (
        <p className="text-[13.5px] text-ink-soft">{canEdit ? "Nothing written yet." : "No script written yet."}</p>
      )}

      <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
        {script?.updatedBy && hasText ? (
          <span className="text-[11.5px] text-ink-soft">
            Edited by {script.updatedBy.name}, {relativeTime(script.updatedAt)}
          </span>
        ) : (
          <span />
        )}
        {(hasText || canEdit) && (
          <Link
            href={href}
            className={`inline-flex items-center gap-1.5 rounded-lg font-bold px-3.5 h-9 text-[13px] transition-[filter] ${
              prominent ? "bg-amber text-white hover:brightness-110" : "border border-line/15 text-ink hover:border-line/30"
            }`}
          >
            <DocumentIcon className="w-4 h-4" />
            {hasText ? (canEdit ? "Open script" : "Read script") : "Write the script"}
            <ArrowRightIcon className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
    </section>
  );
}
