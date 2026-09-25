"use client";

import { useOptimistic } from "react";
import { useAction } from "@/lib/hooks/use-action";
import { Select } from "@/components/ui/select";
import { CloseIcon } from "@/components/ui/icons";
import { assignMember, removeAssignee } from "./actions";
import { useConfirm } from "@/components/ui/confirm-provider";
import type { PipelineStage } from "@/lib/permissions/roles";

type EligibleMember = { teamMemberId: string; name: string; roles: string; color?: string };
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
  const confirm = useConfirm();

  // Instant UI: the chip appears / disappears the moment you act; if the
  // server rejects it, React reverts it and useAction shows the error.
  const [shown, applyOptimistic] = useOptimistic(
    assignees,
    (state: Assignee[], change: { type: "add"; member: EligibleMember } | { type: "remove"; rowId: string }) =>
      change.type === "add"
        ? [
            ...state,
            {
              rowId: `tmp-${change.member.teamMemberId}`,
              teamMemberId: change.member.teamMemberId,
              name: change.member.name,
              color: change.member.color ?? "#999",
            },
          ]
        : state.filter((a) => a.rowId !== change.rowId)
  );

  const assign = useAction(assignMember, {
    optimistic: (_projectId, _stage, memberId) => {
      const member = eligible.find((e) => e.teamMemberId === memberId);
      if (member) applyOptimistic({ type: "add", member });
    },
    success: "Assigned. They've been notified",
  });

  const unassign = useAction(removeAssignee, {
    optimistic: (_projectId, rowId) => applyOptimistic({ type: "remove", rowId }),
  });

  const pending = assign.pending || unassign.pending;
  const assignedIds = new Set(shown.map((a) => a.teamMemberId));
  const available = eligible.filter((e) => !assignedIds.has(e.teamMemberId));

  async function handleRemove(a: Assignee) {
    if (a.rowId.startsWith("tmp-")) return; // still being saved
    const ok = await confirm({
      title: `Unassign ${a.name}?`,
      description: `They'll no longer be tagged on this stage.`,
      confirmLabel: "Unassign",
      danger: true,
    });
    if (!ok) return;
    unassign.run(projectId, a.rowId);
  }

  function handleAssign(id: string) {
    assign.run(projectId, stage, id);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {shown.length === 0 && (
        <span className="text-sm text-ink-soft">Nobody assigned yet.</span>
      )}
      {shown.map((a) => (
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
              <CloseIcon className="w-3 h-3" />
            </button>
          )}
        </span>
      ))}
      {isMaster && available.length > 0 && (
        <Select
          variant="pill"
          value={null}
          disabled={pending}
          onChange={(memberId) => memberId && handleAssign(memberId)}
          options={available.map((m) => ({ value: m.teamMemberId, label: m.name, hint: m.roles }))}
          renderValue={() => <span>+ Assign…</span>}
          ariaLabel="Assign someone to this stage"
        />
      )}
      {isMaster && available.length === 0 && shown.length === 0 && (
        <span className="text-[11.5px] text-ink-soft">
          Nobody holds a role for this stage yet. Assign one from the Team
          page.
        </span>
      )}
    </div>
  );
}
