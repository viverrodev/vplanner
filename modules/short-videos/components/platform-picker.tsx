"use client";

import { PLATFORMS, PLATFORM_META, type Platform } from "../lib/constants";
import { PlatformIcon } from "./platform-icon";
import { CheckIcon } from "@/components/ui/icons";

/** Which platforms this short is meant for (at least one). */
export function PlatformPicker({
  value,
  onChange,
  disabled,
}: {
  value: Platform[];
  onChange: (next: Platform[]) => void;
  disabled?: boolean;
}) {
  function toggle(p: Platform) {
    const on = value.includes(p);
    if (on && value.length === 1) return; // keep at least one
    onChange(on ? value.filter((x) => x !== p) : PLATFORMS.filter((x) => x === p || value.includes(x)));
  }

  return (
    <div className="flex flex-wrap gap-2">
      {PLATFORMS.map((p) => {
        const on = value.includes(p);
        return (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() => toggle(p)}
            aria-pressed={on}
            className={`inline-flex items-center gap-2 rounded-xl border pl-1.5 pr-3 h-10 text-[13px] font-semibold transition-all disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
              on ? "border-line/30 bg-surface text-ink" : "border-line/10 text-ink-faint"
            } ${!disabled ? "hover:border-line/40" : ""}`}
          >
            <PlatformIcon platform={p} className={`w-7 h-7 rounded-lg transition-all ${on ? "" : "grayscale opacity-35"}`} />
            {PLATFORM_META[p].name}
            {on && <CheckIcon className="w-3.5 h-3.5 text-green" />}
          </button>
        );
      })}
    </div>
  );
}
