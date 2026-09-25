"use client";

import { useState } from "react";
import { SettingsIcon } from "@/components/ui/icons";
import {
  ShortSettingsDialog,
  type ShortSettingsContext,
  type ShortSettingsData,
} from "@/modules/short-videos/components/short-settings-dialog";

/** Top-right Settings button: opens everything editable about the short. */
export function SettingsButton({ short, ctx }: { short: ShortSettingsData; ctx: ShortSettingsContext }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line/15 px-3 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink hover:border-line/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
      >
        <SettingsIcon className="w-4 h-4" />
        <span className="hidden sm:inline">Settings</span>
        <span className="sr-only sm:hidden">Settings</span>
      </button>
      <ShortSettingsDialog open={open} onClose={() => setOpen(false)} short={short} ctx={ctx} />
    </>
  );
}
