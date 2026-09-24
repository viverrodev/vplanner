"use client";

import { useEffect } from "react";

/** On first load, bring today's rows into view (the list is chronological). */
export function ScrollToToday() {
  useEffect(() => {
    const el = document.querySelector<HTMLElement>("[data-today-anchor]");
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 140;
    if (top > window.innerHeight * 0.6) window.scrollTo({ top, behavior: "instant" as ScrollBehavior });
  }, []);
  return null;
}
