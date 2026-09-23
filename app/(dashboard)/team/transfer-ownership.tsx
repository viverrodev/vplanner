"use client";

import { useState, useTransition } from "react";
import { transferOwnership } from "./actions";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";

type Candidate = { userId: string; name: string };

export function TransferOwnership({
  teamId,
  candidates,
}: {
  teamId: string;
  candidates: Candidate[];
}) {
  const [selected, setSelected] = useState("");
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const toast = useToast();

  async function handleTransfer() {
    const target = candidates.find((c) => c.userId === selected);
    if (!target) return;

    const ok = await confirm({
      title: `Transfer ownership to ${target.name}?`,
      description:
        "They become the team's permanent owner and Master. You keep whatever roles you already have, but you're no longer the owner — this can't be undone by you alone.",
      confirmLabel: "Transfer ownership",
      danger: true,
    });
    if (!ok) return;

    startTransition(async () => {
      const result = await transferOwnership(teamId, selected);
      if (result?.error) toast.error(result.error);
      else {
        toast.success(`Ownership transferred to ${target.name}`);
        setSelected("");
      }
    });
  }

  if (candidates.length === 0) {
    return (
      <p className="text-[12.5px] text-ink-faint">
        No one else is on this team yet — invite someone before you can transfer ownership.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="rounded-lg border border-line/15 bg-surface px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-amber"
      >
        <option value="">Choose a new owner…</option>
        {candidates.map((c) => (
          <option key={c.userId} value={c.userId}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        onClick={handleTransfer}
        disabled={!selected || pending}
        className="rounded-lg border border-red/40 text-red font-semibold px-3.5 py-2 text-[13px] disabled:opacity-40 hover:bg-red/10 transition-colors"
      >
        {pending ? "Transferring…" : "Transfer ownership"}
      </button>
    </div>
  );
}
