"use client";

import { useTransition } from "react";
import { advanceStage, regressStage } from "./actions";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";

export function AdvanceStageButton({
  projectId,
  nextLabel,
}: {
  projectId: string;
  nextLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const toast = useToast();

  async function handleClick() {
    const ok = await confirm({
      title: `Move this project to ${nextLabel}?`,
      description: "Anyone already tagged on that stage will be notified.",
      confirmLabel: `Advance to ${nextLabel}`,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await advanceStage(projectId);
      if (result?.error) toast.error(result.error);
      else toast.success(`Moved to ${nextLabel}`);
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="inline-flex items-center rounded-lg bg-amber text-white font-semibold px-4 py-2 text-sm disabled:opacity-50 hover:brightness-110 transition-[filter]"
    >
      {pending ? "Moving…" : `Advance to ${nextLabel} →`}
    </button>
  );
}

export function RegressStageButton({
  projectId,
  prevLabel,
}: {
  projectId: string;
  prevLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const toast = useToast();

  async function handleClick() {
    const ok = await confirm({
      title: `Move this project back to ${prevLabel}?`,
      description: "Use this if it turns out to need more work at that stage.",
      confirmLabel: `Back to ${prevLabel}`,
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await regressStage(projectId);
      if (result?.error) toast.error(result.error);
      else toast.success(`Moved back to ${prevLabel}`);
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="inline-flex items-center rounded-lg border-2 border-line/15 text-ink-soft font-semibold px-4 py-2 text-sm disabled:opacity-50 hover:border-red/40 hover:text-red transition-colors"
    >
      {pending ? "Moving…" : `← Back to ${prevLabel}`}
    </button>
  );
}
