"use client";

import { useState, useTransition } from "react";
import { updateTeamName } from "./actions";
import { useToast } from "@/components/ui/toast-provider";
import { EditIcon } from "@/components/ui/icons";

export function TeamNameEditor({ teamId, name }: { teamId: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function save() {
    startTransition(async () => {
      const result = await updateTeamName(teamId, draft);
      if (result?.error) toast.error(result.error);
      else {
        toast.success("Team name updated");
        setEditing(false);
      }
    });
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="rounded-lg border border-amber/50 bg-surface px-3 py-1.5 text-[15px] font-semibold outline-none focus:ring-2 focus:ring-amber"
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
            setDraft(name);
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
      onClick={() => setEditing(true)}
      className="flex items-center gap-2 group"
    >
      <span className="font-display text-xl font-semibold">{name}</span>
      <EditIcon className="w-3.5 h-3.5 text-ink-faint group-hover:text-amber transition-colors" />
    </button>
  );
}
