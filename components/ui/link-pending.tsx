"use client";

import { useLinkStatus } from "next/link";

/**
 * Drop inside any <Link>: shows a tiny spinner the instant the link is
 * clicked, until the new page is ready. Used where navigation stays on
 * the same page (e.g. switching project tabs), which doesn't show a
 * route loading skeleton — so there's always immediate feedback.
 */
export function LinkPendingIndicator({ className = "" }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`inline-block h-3 rounded-full border-current border-t-transparent animate-spin ${
        pending ? "w-3 border-[1.5px] opacity-70" : "w-0 border-0 opacity-0"
      } ${className}`}
    />
  );
}
