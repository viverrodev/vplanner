"use client";

import { useEffect, useRef } from "react";

/**
 * Horizontal scroller that centers its `[data-current="true"]` child on
 * mount — so on a phone the stage tracker opens on the stage you're in,
 * not on "Ideate". Only scrolls sideways; never moves the page.
 */
export function ScrollToCurrent({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const current = el?.querySelector<HTMLElement>('[data-current="true"]');
    if (!el || !current) return;
    const target = current.offsetLeft - el.clientWidth / 2 + current.clientWidth / 2;
    el.scrollLeft = Math.max(0, target);
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
