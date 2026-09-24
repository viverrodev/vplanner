"use client";

import { setShortDayLimit } from "@/app/(dashboard)/shorts/actions";
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
}: {
  teamId: string;
  day: string;
  count: number;
  limit: number;
  isException: boolean;
  teamDefault: number;
  canEdit: boolean;
}) {
  const label = formatShortDate(day) ?? day;
  const save = useAction(setShortDayLimit, {
    success: (_t, _d, n) =>
      n === null ? `${label} is back to the team default — dates updated` : `${label} now takes ${n} — dates updated`,
  });

  const face = (
    <span className={`tabular-nums normal-case font-semibold ${count > limit ? "text-red" : ""}`}>
      {count}/{limit}
      {isException && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-amber">exception</span>}
    </span>
  );

  if (!canEdit) return face;

  const options = [
    { value: "default", label: `Team default (${teamDefault})`, hint: "Remove the exception" },
    { value: "0", label: "No shorts this day" },
    ...Array.from({ length: 10 }, (_, i) => ({
      value: String(i + 1),
      label: `${i + 1} short${i === 0 ? "" : "s"}`,
    })),
  ];

  return (
    <Select
      variant="inline"
      value={isException ? String(limit) : "default"}
      onChange={(v) => {
        if (!v) return;
        save.run(teamId, day, v === "default" ? null : Number(v));
      }}
      options={options}
      disabled={save.pending}
      ariaLabel={`How many shorts on ${label}`}
      renderValue={() => face}
      menuMinWidth={210}
    />
  );
}
