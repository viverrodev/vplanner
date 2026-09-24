/** Local YYYY-MM-DD for "today" (the planned date is a calendar day, not a moment). */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatShortDate(iso: string | null, opts: { withYear?: boolean } = {}) {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(opts.withYear || !sameYear ? { year: "numeric" } : {}),
  });
}

/** "Today", "Tomorrow", "In 3 days", "2 days late"… relative to local today. */
export function relativeDay(iso: string | null) {
  if (!iso) return null;
  const a = new Date(iso + "T00:00:00").getTime();
  const b = new Date(todayISO() + "T00:00:00").getTime();
  const days = Math.round((a - b) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1 && days <= 14) return `In ${days} days`;
  if (days < -1) return `${-days} days ago`;
  return null;
}

/** Past its planned date and not posted yet. */
export function isOverdue(iso: string | null, stage: string) {
  return !!iso && stage !== "posted" && iso < todayISO();
}
