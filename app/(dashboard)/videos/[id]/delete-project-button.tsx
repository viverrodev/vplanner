"use client";

import { useTransition } from "react";
import { deleteProject } from "./actions";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { TrashIcon } from "@/components/ui/icons";

export function DeleteProjectButton({
  projectId,
  teamId,
  projectTitle,
}: {
  projectId: string;
  teamId: string;
  projectTitle: string;
}) {
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const toast = useToast();

  async function handleClick() {
    const ok = await confirm({
      title: `Delete "${projectTitle}"?`,
      description:
        "This permanently removes the project — every note, thumbnail, and attachment along with it. This can't be undone.",
      confirmLabel: "Delete permanently",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteProject(projectId, teamId);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      aria-label="Delete project"
      title="Delete project"
      className="w-9 h-9 rounded-lg text-ink-faint flex items-center justify-center hover:text-red hover:bg-red/10 transition-colors disabled:opacity-40"
    >
      <TrashIcon className="w-[15px] h-[15px]" />
    </button>
  );
}
