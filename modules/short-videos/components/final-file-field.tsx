"use client";

import { useEffect, useRef, useState } from "react";
import { updateShortDetails } from "@/app/(dashboard)/shorts/actions";
import { useAction } from "@/lib/hooks/use-action";
import { CheckIcon, EditIcon, ExternalIcon, LinkIcon } from "@/components/ui/icons";
import { isFrameioLink } from "../lib/constants";
import { CopyButton } from "./copy-button";

/**
 * The Frame.io link for the finished video. Nothing is saved until you
 * press Confirm (or Enter); Esc cancels. Once saved it shows as a link
 * with an Edit button, so it can't change by accident.
 */
export function FinalFileField({ id, link, canEdit }: { id: string; link: string | null; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(link ?? "");
  const [shown, setShown] = useState(link);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setShown(link);
    if (!editing) setDraft(link ?? "");
  }, [link]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = useAction(updateShortDetails, {
    optimistic: (_id, patch) => setShown(patch.file_link ?? null),
    success: "Final file saved",
    onSuccess: () => setEditing(false),
    onError: () => setShown(link),
  });

  const clean = draft.trim();
  const valid = isFrameioLink(clean);

  function confirm() {
    if (!valid || save.pending) return;
    if (clean === (link ?? "")) return setEditing(false);
    save.run(id, { file_link: clean });
  }

  if (editing) {
    return (
      <div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 min-w-0">
            <LinkIcon className="w-4 h-4 text-ink-soft absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirm();
                }
                if (e.key === "Escape") {
                  setDraft(shown ?? "");
                  setEditing(false);
                }
              }}
              placeholder="https://app.frame.io/reviews/…"
              maxLength={2000}
              aria-invalid={!!clean && !valid}
              className={`w-full rounded-lg border bg-surface pl-9 pr-3 h-10 text-[13.5px] outline-none focus:ring-2 ${
                clean && !valid ? "border-red/60 focus:ring-red/40" : "border-line/15 focus:ring-amber"
              }`}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={!valid || save.pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green text-white font-bold px-4 h-10 text-[13.5px] disabled:opacity-40"
            >
              <CheckIcon className="w-4 h-4" />
              {save.pending ? "Saving…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(shown ?? "");
                setEditing(false);
              }}
              className="rounded-lg px-3 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2"
            >
              Cancel
            </button>
          </div>
        </div>
        <p className={`mt-1.5 text-[12px] ${clean && !valid ? "text-red" : "text-ink-soft"}`}>
          {clean && !valid ? "That isn't a Frame.io link." : "Paste the Frame.io review link."}
        </p>
      </div>
    );
  }

  if (!shown) {
    return canEdit ? (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-dashed border-line/30 px-3.5 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/50"
      >
        <LinkIcon className="w-4 h-4" />
        Add Frame.io link
      </button>
    ) : (
      <p className="text-[13.5px] text-ink-soft">The editor adds the Frame.io link when the video is ready.</p>
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <a
        href={shown}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 min-w-0 inline-flex items-center gap-2 rounded-lg border border-line/15 px-3 h-10 text-[13.5px] font-medium hover:border-line/30"
      >
        <ExternalIcon className="w-4 h-4 text-green flex-shrink-0" />
        <span className="truncate">{shown.replace(/^https:\/\//, "")}</span>
      </a>
      <CopyButton text={shown} toastText="Link copied" />
      {canEdit && (
        <button
          type="button"
          onClick={() => {
            setDraft(shown);
            setEditing(true);
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 h-8 text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2"
        >
          <EditIcon className="w-3.5 h-3.5" />
          Edit
        </button>
      )}
    </div>
  );
}
