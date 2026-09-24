"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertIcon, CalendarIcon } from "@/components/ui/icons";
import { DatePicker } from "@/components/ui/date-picker";
import type { DatedShort } from "../lib/queries";
import { formatShortDate, relativeDay, todayISO } from "../lib/dates";

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type PinKind = "anchor" | "oneoff";
export type ScheduleValue = { mode: "auto" } | { mode: "pinned"; date: string; kind: PinKind };

/**
 * Auto (default): the short takes the next free slot in the team's queue
 * — N per day from team settings — and we show exactly which day.
 * Today / Tomorrow / a picked date pin it to that day instead.
 */
export function ScheduleField({
  value,
  onChange,
  autoDate,
  autoLabel = "This short will be scheduled for",
  planned,
  perDay,
  limits = {},
  weekends = true,
  excludeId,
  disabled,
}: {
  value: ScheduleValue;
  onChange: (v: ScheduleValue) => void;
  /** The date Auto gives (next slot for a new short / its queue date). */
  autoDate: string | null;
  autoLabel?: string;
  planned: DatedShort[];
  perDay: number;
  /** Day exceptions: { "2026-09-30": 1 } */
  limits?: Record<string, number>;
  weekends?: boolean;
  excludeId?: string;
  disabled?: boolean;
}) {
  // The viewer's local "today" — computed in the browser (server clock is UTC).
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(todayISO()), []);

  const countByDate = useMemo(() => {
    const m = new Map<string, DatedShort[]>();
    planned.filter((p) => p.id !== excludeId).forEach((p) => m.set(p.date, [...(m.get(p.date) ?? []), p]));
    return m;
  }, [planned, excludeId]);

  const pinnedDate = value.mode === "pinned" ? value.date : null;
  const kind: PinKind = value.mode === "pinned" ? value.kind : "anchor";
  const pin = (date: string) => onChange({ mode: "pinned", date, kind });
  const capacity = (d: string) =>
    d in limits ? limits[d] : !weekends && [0, 6].includes(new Date(d + "T00:00:00").getDay()) ? 0 : perDay;
  // A pinned date that isn't simply "Today" or "Tomorrow".
  const customPinned = !!pinnedDate && !!today && pinnedDate !== today && pinnedDate !== addDays(today, 1);
  const sameDay = pinnedDate ? countByDate.get(pinnedDate) ?? [] : [];
  const dayCap = pinnedDate ? capacity(pinnedDate) : perDay;
  const full = sameDay.length >= dayCap;

  const chip = (active: boolean) =>
    `rounded-lg border px-3 h-9 text-[12.5px] font-semibold transition-colors disabled:opacity-50 ${
      active ? "border-amber bg-amber/10 text-amber" : "border-line/15 text-ink-soft hover:text-ink hover:border-line/30"
    }`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={disabled} onClick={() => onChange({ mode: "auto" })} className={chip(value.mode === "auto")}>
          Auto
        </button>
        {today && (
          <>
            <button
              type="button"
              disabled={disabled}
              onClick={() => pin(today)}
              className={chip(pinnedDate === today)}
            >
              Today
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => pin(addDays(today, 1))}
              className={chip(pinnedDate === addDays(today, 1))}
            >
              Tomorrow
            </button>
          </>
        )}
        <DatePicker
          value={pinnedDate}
          onChange={(d) => pin(d)}
          disabled={disabled}
          dayInfo={(d) => {
            const n = countByDate.get(d)?.length ?? 0;
            return { count: n, limit: capacity(d) };
          }}
          triggerClassName={`inline-flex items-center gap-1.5 rounded-lg border px-3 h-9 text-[12.5px] font-semibold transition-colors disabled:opacity-50 ${
            customPinned ? "border-amber bg-amber/10 text-amber" : "border-line/15 text-ink-soft hover:text-ink hover:border-line/30"
          }`}
        >
          <CalendarIcon className="w-3.5 h-3.5" />
          {customPinned ? formatShortDate(pinnedDate) : "Pick a date"}
        </DatePicker>
      </div>

      {value.mode === "auto" ? (
        <p className="mt-2.5 text-[13px] text-ink-soft">
          {autoLabel}:{" "}
          <b className="text-ink">{autoDate ? formatShortDate(autoDate) : "the next free slot"}</b>
          {autoDate && relativeDay(autoDate) ? <span className="text-ink-faint"> · {relativeDay(autoDate)}</span> : null}
          <span className="block text-[11.5px] text-ink-faint mt-0.5">
            Fills the next free slot ({perDay} per day). Moves automatically if the schedule changes.
          </span>
        </p>
      ) : (
        <div className="mt-2.5">
          <p className="text-[12.5px] text-ink-soft mb-2">
            Fixed on <b className="text-ink">{formatShortDate(value.date, { withYear: true })}</b>
          </p>
          <div role="radiogroup" aria-label="How the queue treats this date" className="grid gap-1.5 sm:grid-cols-2">
            {([
              ["anchor", "Start queue from here", "Auto shorts after it continue from this date."],
              ["oneoff", "Just this one", "Holds its slot; the queue carries on as if it weren't there."],
            ] as const).map(([k, label, hint]) => {
              const on = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={disabled}
                  onClick={() => onChange({ mode: "pinned", date: value.date, kind: k })}
                  className={`text-left rounded-lg border px-3 py-2 transition-colors disabled:opacity-50 ${
                    on ? "border-amber bg-amber/10" : "border-line/15 hover:border-line/30"
                  }`}
                >
                  <span className={`flex items-center gap-2 text-[12.5px] font-semibold ${on ? "text-amber" : "text-ink"}`}>
                    <span className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${on ? "border-amber bg-amber shadow-[inset_0_0_0_2px_rgb(var(--surface))]" : "border-line/40"}`} />
                    {label}
                  </span>
                  <span className="block text-[11.5px] text-ink-soft mt-0.5 pl-[22px]">{hint}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {sameDay.length > 0 && (
        <p className={`mt-2 flex items-start gap-1.5 text-[12px] ${full ? "text-red" : "text-amber"}`}>
          <AlertIcon className="w-3.5 h-3.5 mt-[1px] flex-shrink-0" />
          <span>
            {full
              ? `That day is already full (${sameDay.length}/${dayCap}): `
              : `Already planned that day (${sameDay.length}/${dayCap}): `}
            {sameDay
              .slice(0, 3)
              .map((s) => `#${s.number} “${s.title}”`)
              .join(", ")}
            {sameDay.length > 3 ? "…" : ""}
          </span>
        </p>
      )}
    </div>
  );
}
