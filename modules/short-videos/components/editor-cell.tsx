"use client";

import { useState } from "react";
import { assignShortPerson } from "@/app/(dashboard)/shorts/actions";
import { useAction } from "@/lib/hooks/use-action";
import { useConfirm } from "@/components/ui/confirm-provider";
import { Select } from "@/components/ui/select";
import type { TeamPerson } from "../lib/queries";
import { PersonAvatar } from "./person-chip";
import { personOptions } from "./person-select";

type Current = { memberId: string; name: string; avatarUrl: string | null; color: string } | null;

/**
 * Table cell: the editor, with a dropdown arrow for masters (people with
 * the Editor role), then a confirm before it's changed.
 */
export function EditorCell({
  id,
  number,
  current,
  editors,
  canChange,
}: {
  id: string;
  number: number;
  current: Current;
  editors: TeamPerson[];
  canChange: boolean;
}) {
  const confirm = useConfirm();
  const [shown, setShown] = useState<Current>(current);
  const assign = useAction(assignShortPerson, {
    success: (_id, _role, m) => (m ? `Editor changed on #${number} — they've been notified` : `Editor removed from #${number}`),
    onError: () => setShown(current),
  });

  const face = (p: Current) =>
    p ? (
      <>
        <PersonAvatar name={p.name} avatarUrl={p.avatarUrl} color={p.color} />
        <span className="text-[12.5px] truncate">{p.name}</span>
      </>
    ) : (
      <span className="text-[12.5px] text-ink-soft">Assign editor</span>
    );

  if (!canChange) {
    return (
      <span className="flex items-center gap-2 min-w-0">
        {shown ? face(shown) : <span className="text-[12px] text-ink-soft">Unassigned</span>}
      </span>
    );
  }

  async function onPick(memberId: string | null) {
    if (memberId === (shown?.memberId ?? null)) return;
    const person = memberId ? editors.find((e) => e.memberId === memberId) : null;
    const ok = await confirm({
      title: person ? `Make ${person.name} the editor of #${number}?` : `Remove the editor from #${number}?`,
      description: person ? "They'll get a notification." : undefined,
      confirmLabel: person ? "Change editor" : "Remove",
    });
    if (!ok) return;
    setShown(person ? { memberId: person.memberId, name: person.name, avatarUrl: person.avatarUrl, color: person.color } : null);
    assign.run(id, "editor", memberId);
  }

  return (
    <span className="relative z-10 min-w-0 max-w-full">
      <Select
        variant="inline"
        value={shown?.memberId ?? null}
        onChange={onPick}
        options={personOptions("editor", editors, shown?.memberId ?? null)}
        emptyOption="Unassigned"
        disabled={assign.pending}
        ariaLabel={`Editor of #${number}`}
        renderValue={() => face(shown)}
      />
    </span>
  );
}
