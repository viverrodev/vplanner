"use client";

import { useState, useTransition } from "react";
import { updateExpectedDate } from "./actions";
import { useToast } from "@/components/ui/toast-provider";
import { formatDate } from "@/modules/long-videos/lib/stages";

export function ExpectedDateEditor({
  projectId,
  teamId,
  date,
  canEdit,
}: {
  projectId: string;
  teamId: string;
  date: string | null;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(date ?? "");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function save() {
    startTransition(async () => {
      const result = await updateExpectedDate(projectId, teamId, draft);
      if (result?.error) toast.error(result.error);
      else {
        toast.success("Expected date updated");
        setEditing(false);
      }
    });
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="rounded-lg border border-amber/50 bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-amber"
        />
        <button
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-amber text-white text-[12px] font-semibold px-3 py-1.5 disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={() => {
            setDraft(date ?? "");
            setEditing(false);
          }}
          className="rounded-lg border border-line/15 text-ink-soft text-[12px] font-semibold px-3 py-1.5"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => canEdit && setEditing(true)}
      disabled={!canEdit}
      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 border ${
        canEdit ? "cursor-pointer hover:border-amber" : "cursor-default"
      }`}
      style={{
        borderColor: "rgb(var(--amber) / 0.35)",
        background: "rgb(var(--amber) / 0.1)",
      }}
    >
      <span className="text-amber text-[13px]">📅</span>
      <span className="text-[13.5px] font-bold text-amber">
        {date ? formatDate(date) : "No expected date set"}
      </span>
      {canEdit && (
        <span className="text-[10.5px] text-ink-soft font-medium">Edit</span>
      )}
    </button>
  );
}
