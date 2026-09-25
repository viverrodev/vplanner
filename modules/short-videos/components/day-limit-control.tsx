"use client";

import { useState } from "react";
import { setShortDayLimit } from "@/app/(dashboard)/shorts/actions";
import { KeepShortsDialog, type DayShort } from "./keep-shorts-dialog";
import { useAction } from "@/lib/hooks/use-action";
import { Select } from "@/components/ui/select";
import { formatShortDate } from "../lib/dates";

/**
 * The "1/2" on a day header. Masters click it to make that day an
 * exception (0–10 shorts) — any time, including today — or reset it to
 * the team default. Everything after re-dates instantly.
 */
export function DayLimitControl({
  teamId,
  day,
  count,
  limit,
  isException,
  teamDefault,
  canEdit,
  dayShorts = [],
}: {
  teamId: string;
  day: string;
  count: number;
  limit: number;
  isException: boolean;
  teamDefault: number;
  canEdit: boolean;
  /** The shorts on this day, so you can choose which stay when lowering it. */
  dayShorts?: DayShort[];
}) {
  const [asking, setAsking] = useState<number | null>(null);
  const label = formatShortDate(day) ?? day;
  const save = useAction<Parameters<typeof setShortDayLimit>, Awaited<ReturnType<typeof setShortDayLimit>>>(setShortDayLimit, {
    success: (_t, _d, n) =>
      n === null ? `${label} is back to the team default. Dates updated.` : `${label} now takes ${n}. Dates updated.`,
  });

  const face = (
    <span className={`tabular-nums normal-case font-semibold ${count > limit ? "text-red" : ""}`}>
      {count}/{limit}
      {isException && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-amber">exception</span>}
    </span>
  );

  if (!canEdit) return face;

  const options = [
    { value: "default", label: `Team default (${teamDefault})`, hint: "Removes the exception" },
    { value: "0", label: "No shorts this day" },
    ...Array.from({ length: 10 }, (_, i) => ({
      value: String(i + 1),
      label: `${i + 1} short${i === 0 ? "" : "s"}`,
    })),
  ];

  function choose(v: string | null) {
    if (!v) return;
    if (v === "default") return save.run(teamId, day, null);
    const n = Number(v);
    // Fewer slots than shorts on the day: ask which ones stay.
    if (n < dayShorts.length) return setAsking(n);
    save.run(teamId, day, n);
  }

  return (
    <>
    {asking !== null && (
      <KeepShortsDialog
        dayLabel={label}
        limit={asking}
        shorts={dayShorts}
        onCancel={() => setAsking(null)}
        onConfirm={(keep) => {
          const n = asking;
          setAsking(null);
          save.run(teamId, day, n, keep);
        }}
      />
    )}
    <Select
      variant="inline"
      value={isException ? String(limit) : "default"}
      onChange={choose}
      options={options}
      disabled={save.pending}
      ariaLabel={`How many shorts on ${label}`}
      renderValue={() => face}
      menuMinWidth={210}
    />
    </>
  );
}
