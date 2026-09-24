"use client";

import { useEffect, useRef, useState } from "react";
import { updateShortDetails } from "../actions";
import { useAction } from "@/lib/hooks/use-action";
import { EditIcon } from "@/components/ui/icons";

/** Title that turns into an input on click (when allowed). Enter saves, Esc cancels. */
export function ShortTitle({ id, number, title, canEdit }: { id: string; number: number; title: string; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [shown, setShown] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setShown(title);
    setDraft(title);
  }, [title]);

  const save = useAction(updateShortDetails, {
    optimistic: (_id, patch) => patch.title && setShown(patch.title.trim()),
    onError: () => setShown(title),
  });

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (!next || next === title) {
      setDraft(title);
      return;
    }
    save.run(id, { title: next });
  }

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  return (
    <h1 className="flex-1 min-w-0 font-display text-[26px] sm:text-3xl font-semibold leading-tight">
      <span className="font-mono text-[15px] sm:text-[17px] font-semibold text-ink-faint align-middle mr-2 tabular-nums">
        #{number}
      </span>
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          maxLength={200}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(title);
              setEditing(false);
            }
          }}
          className="w-full mt-1 rounded-lg border border-amber/60 bg-surface px-3 py-1.5 text-[22px] font-display font-semibold outline-none focus:ring-2 focus:ring-amber"
          aria-label="Short title"
        />
      ) : canEdit ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="group text-left hover:text-ink-soft transition-colors"
          title="Rename"
        >
          {shown}
          <EditIcon className="inline-block ml-2 w-4 h-4 text-ink-faint sm:opacity-0 sm:group-hover:opacity-100 transition-opacity align-middle" />
        </button>
      ) : (
        shown
      )}
    </h1>
  );
}
