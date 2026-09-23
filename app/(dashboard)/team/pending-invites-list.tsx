"use client";

import { useTransition } from "react";
import { cancelInvite } from "./actions";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { displayName, colorForId, initialsFor } from "@/lib/avatar";
import { ROLES } from "@/lib/permissions/roles";
import type { RoleId } from "@/lib/permissions/roles";

export type PendingInviteRow = {
  id: string;
  name: string;
  proposedRoles: RoleId[];
  expiresAt: string;
};

export function PendingInvitesList({
  teamId,
  invites,
}: {
  teamId: string;
  invites: PendingInviteRow[];
}) {
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const toast = useToast();

  async function handleCancel(invite: PendingInviteRow) {
    const ok = await confirm({
      title: `Cancel invite to ${invite.name}?`,
      description: "They'll no longer be able to accept it. You can always invite them again.",
      confirmLabel: "Cancel invite",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await cancelInvite(teamId, invite.id);
      if (result?.error) toast.error(result.error);
      else toast.success("Invite cancelled");
    });
  }

  if (invites.length === 0) return null;

  return (
    <div className="space-y-1.5 mb-4">
      {invites.map((invite) => {
        const minutesLeft = Math.max(
          0,
          Math.round((new Date(invite.expiresAt).getTime() - Date.now()) / 60000)
        );
        return (
          <div
            key={invite.id}
            className="flex items-center gap-2.5 rounded-lg border border-line/10 px-3 py-2"
          >
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
              style={{ background: colorForId(invite.id) }}
            >
              {initialsFor(invite.name)}
            </span>
            <span className="text-[12.5px] font-semibold flex-1 truncate">
              {invite.name}
            </span>
            <span className="text-[10.5px] text-ink-faint hidden sm:inline">
              {invite.proposedRoles.map((r) => ROLES.find((role) => role.id === r)?.name).join(", ") || "No roles"}
            </span>
            <span className="text-[10.5px] font-bold uppercase tracking-wide text-amber">
              {minutesLeft > 0 ? `${minutesLeft}m left` : "Expiring"}
            </span>
            <button
              onClick={() => handleCancel(invite)}
              disabled={pending}
              className="text-[11px] font-semibold text-ink-faint hover:text-red disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        );
      })}
    </div>
  );
}
