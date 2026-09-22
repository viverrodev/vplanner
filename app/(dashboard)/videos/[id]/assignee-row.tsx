"use client";

import { useTransition } from "react";
import { assignMember, removeAssignee } from "./actions";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import type { PipelineStage } from "@/lib/permissions/roles";

type EligibleMember = { teamMemberId: string; name: string; roles: string };
type Assignee = { rowId: string; teamMemberId: string; name: string; color: string };

export function AssigneeRow({
  projectId,
  stage,
  isMaster,
  assignees,
  eligible,
}: {
  projectId: string;
  stage: PipelineStage;
  isMaster: boolean;
  assignees: Assignee[];
  eligible: EligibleMember[];
}) {
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const toast = useToast();
  const assignedIds = new Set(assignees.map((a) => a.teamMemberId));
  const available = eligible.filter((e) => !assignedIds.has(e.teamMemberId));

  async function handleRemove(a: Assignee) {
    const ok = await confirm({
      title: `Unassign ${a.name}?`,
      description: `They'll no longer be tagged on this stage.`,
      confirmLabel: "Unassign",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      await removeAssignee(projectId, a.rowId);
      toast.success(`${a.name} unassigned`);
    });
  }

  async function handleAssign(id: string) {
    startTransition(async () => {
      const result = await assignMember(projectId, stage, id);
      if (result?.error) toast.error(result.error);
      else toast.success("Assigned — they've been notified");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {assignees.length === 0 && (
        <span className="text-sm text-ink-soft">Nobody assigned yet.</span>
      )}
      {assignees.map((a) => (
        <span
          key={a.rowId}
          className="inline-flex items-center gap-1.5 rounded-full border border-line/15 bg-surface-2 pl-1 pr-2.5 py-1 text-[12.5px] font-medium"
        >
          <span
            className="w-4 h-4 rounded-full flex-shrink-0"
            style={{ background: a.color }}
          />
          {a.name}
          {isMaster && (
            <button
              onClick={() => handleRemove(a)}
              disabled={pending}
              className="text-ink-faint hover:text-red ml-0.5"
              aria-label={`Remove ${a.name}`}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {isMaster && available.length > 0 && (
        <select
          disabled={pending}
          onChange={(e) => {
            const id = e.target.value;
            if (id) handleAssign(id);
            e.target.value = "";
          }}
          defaultValue=""
          className="text-[12.5px] rounded-full border border-dashed border-line/25 px-2.5 py-1 bg-transparent text-ink-soft"
        >
          <option value="">+ Assign…</option>
          {available.map((m) => (
            <option key={m.teamMemberId} value={m.teamMemberId}>
              {m.name} ({m.roles})
            </option>
          ))}
        </select>
      )}
      {isMaster && available.length === 0 && assignees.length === 0 && (
        <span className="text-[11.5px] text-ink-soft">
          Nobody holds a role for this stage yet — assign one from the Team
          page.
        </span>
      )}
    </div>
  );
}
