"use client";

import { useState, useTransition } from "react";
import { setPrimaryTitle, updateTitleText } from "./title-actions";
import { useToast } from "@/components/ui/toast-provider";
import { EditIcon } from "@/components/ui/icons";

type Title = { id: string; title: string; is_picked: boolean };

export function TitleList({
  projectId,
  teamId,
  titles,
  canPick,
  canEditText,
}: {
  projectId: string;
  teamId: string;
  titles: Title[];
  canPick: boolean;
  canEditText: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const toast = useToast();

  function startEdit(t: Title) {
    setEditingId(t.id);
    setDraft(t.title);
  }

  function save(titleId: string) {
    if (!draft.trim()) {
      toast.error("A title can't be empty.");
      return;
    }
    startTransition(async () => {
      const result = await updateTitleText(projectId, teamId, titleId, draft);
      if (result?.error) toast.error(result.error);
      else setEditingId(null);
    });
  }

  return (
    <div className="space-y-1.5">
      {titles.map((t) => {
        if (editingId === t.id) {
          return (
            <div key={t.id} className="flex items-center gap-1.5">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save(t.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="flex-1 rounded-lg border border-amber/50 bg-surface px-3 py-2 text-[13.5px] outline-none focus:ring-2 focus:ring-amber"
              />
              <button
                onClick={() => save(t.id)}
                disabled={pending}
                className="rounded-lg bg-amber text-white text-[12px] font-semibold px-3 py-2 disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="rounded-lg border border-line/15 text-ink-soft text-[12px] font-semibold px-3 py-2"
              >
                Cancel
              </button>
            </div>
          );
        }

        const clickableToPick = canPick && !t.is_picked;
        return (
          <div
            key={t.id}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
              t.is_picked
                ? "border-amber/40 bg-amber/10 font-medium"
                : "border-line/10"
            }`}
          >
            <button
              type="button"
              disabled={!clickableToPick}
              onClick={() => {
                if (!clickableToPick) return;
                startTransition(() => {
                  setPrimaryTitle(projectId, teamId, t.id, t.title);
                });
              }}
              className={`flex-1 text-left text-[13.5px] ${
                clickableToPick ? "cursor-pointer hover:text-amber" : "cursor-default"
              }`}
            >
              {t.is_picked ? "★ " : canPick ? "☆ " : ""}
              {t.title}
            </button>
            {canEditText && (
              <button
                onClick={() => startEdit(t)}
                className="flex-shrink-0 text-ink-soft hover:text-amber px-1"
                title="Edit this title"
              >
                <EditIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      })}
      {canPick && (
        <p className="text-[11px] text-ink-soft pt-1">
          Click a title to make it the final one.
        </p>
      )}
    </div>
  );
}
