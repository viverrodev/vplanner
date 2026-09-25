"use client";

import { useTransition } from "react";
import { deleteShort, setShortDayLimit } from "@/app/(dashboard)/shorts/actions";
import { useToast } from "@/components/ui/toast-provider";
import { formatShortDate } from "./dates";

/**
 * Delete a short. The queue pulls the next short in to fill the gap —
 * and the toast offers the alternative in one click: keep that day at
 * the number it has left (a day exception), pushing things back out.
 */
export function useDeleteShort(onDeleted?: () => void) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function run(id: string, number: number) {
    startTransition(async () => {
      const res = await deleteShort(id);
      if (res.error !== undefined) {
        toast.error(res.error);
        return;
      }
      onDeleted?.();
      const v = "vacated" in res ? res.vacated : undefined;
      if (!v) {
        toast.success(`#${number} deleted`);
        return;
      }
      const dayLabel = formatShortDate(v.day) ?? v.day;
      toast.success(`#${number} deleted. The next short moved up to fill ${dayLabel}.`, {
        action: {
          label: v.keep === 0 ? `Leave ${dayLabel} empty` : `Keep ${dayLabel} at ${v.keep}`,
          onClick: async () => {
            const r = await setShortDayLimit(v.teamId, v.day, v.keep);
            if (r.error !== undefined) toast.error(r.error);
            else toast.success(v.keep === 0 ? `${dayLabel} left empty. Dates updated` : `${dayLabel} now takes ${v.keep}. Dates updated`);
          },
        },
      });
    });
  }

  return { run, pending };
}
