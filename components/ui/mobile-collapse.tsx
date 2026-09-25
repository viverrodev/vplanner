"use client";

import { useState } from "react";
import { ChevronDownIcon } from "./icons";

/**
 * On phones: a tappable header that shows/hides its content (closed by
 * default, to keep long pages calm). On desktop: always open, header
 * hidden. Pure CSS switch, so no layout jump on load.
 */
export function MobileCollapse({
  label,
  count,
  children,
  className = "",
}: {
  label: string;
  count?: number;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="md:hidden w-full flex items-center justify-between rounded-xl border border-line/15 bg-surface px-4 h-11 text-[13.5px] font-semibold"
      >
        <span>
          {label}
          {count !== undefined && <span className="ml-1.5 text-ink-soft font-medium">{count}</span>}
        </span>
        <ChevronDownIcon className={`w-4 h-4 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`${open ? "block mt-3" : "hidden"} md:block md:mt-0`}>{children}</div>
    </div>
  );
}

/** Filter row: inline on desktop, behind a "Filters" button on phones. */
export function CollapsibleFilters({ active, children }: { active: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`md:hidden inline-flex items-center gap-1.5 rounded-lg border px-3 h-9 text-[13px] font-semibold ${
          active > 0 ? "border-amber/50 bg-amber/10 text-amber" : "border-line/15 text-ink-soft"
        }`}
      >
        Filters{active > 0 ? ` · ${active}` : ""}
        <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`${open ? "flex" : "hidden"} md:flex w-full md:w-auto flex-wrap items-center gap-1.5`}>{children}</div>
    </>
  );
}
