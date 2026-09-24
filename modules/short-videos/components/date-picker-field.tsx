"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertIcon } from "@/components/ui/icons";
import type { DatedShort } from "../lib/queries";
import { formatShortDate, todayISO } from "../lib/dates";

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Planned-date input with one-tap presets (Today, Tomorrow, Next free
 * day) and a heads-up when other shorts already land on the same day.
 */
export function PlannedDateField({
  value,
  onChange,
  planned,
  excludeId,
  disabled,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  planned: DatedShort[];
  excludeId?: string;
  disabled?: boolean;
}) {
  const byDate = useMemo(() => {
    const m = new Map<string, DatedShort[]>();
    planned
      .filter((p) => p.id !== excludeId)
      .forEach((p) => m.set(p.date, [...(m.get(p.date) ?? []), p]));
    return m;
  }, [planned, excludeId]);

  // "Today" must be the viewer's local day, so it's computed in the
  // browser after mount (the server's clock is UTC and can be a day off).
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(todayISO()), []);

  const nextFree = useMemo(() => {
    if (!today) return null;
    for (let i = 0; i < 365; i++) {
      const d = addDays(today, i);
      if (!byDate.has(d)) return d;
    }
    return null;
  }, [byDate, today]);

  const sameDay = value ? byDate.get(value) ?? [] : [];
  const presets = today
    ? [
        { label: "Today", date: today },
        { label: "Tomorrow", date: addDays(today, 1) },
        ...(nextFree && nextFree !== today && nextFree !== addDays(today, 1)
          ? [{ label: `Next free day · ${formatShortDate(nextFree)}`, date: nextFree }]
          : []),
      ]
    : [];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value || null)}
          className="rounded-lg border border-line/15 bg-surface px-3 h-10 text-[14px] outline-none focus:ring-2 focus:ring-amber disabled:opacity-60"
        />
        {!disabled &&
          presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange(p.date)}
              className={`rounded-lg border px-2.5 h-8 text-[12px] font-semibold transition-colors ${
                value === p.date
                  ? "border-amber bg-amber/10 text-amber"
                  : "border-line/15 text-ink-soft hover:text-ink hover:border-line/30"
              }`}
            >
              {p.label}
            </button>
          ))}
        {!disabled && value && (
          <button type="button" onClick={() => onChange(null)} className="text-[12px] font-semibold text-ink-faint hover:text-ink px-1">
            Clear
          </button>
        )}
      </div>
      {sameDay.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] text-amber">
          <AlertIcon className="w-3.5 h-3.5 mt-[1px] flex-shrink-0" />
          <span>
            {sameDay.length === 1 ? "Another short is" : `${sameDay.length} other shorts are`} already planned that day:{" "}
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
