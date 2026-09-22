import { findMentions, type MentionTarget } from "@/lib/mentions";
import { colorForId } from "@/lib/avatar";
import type { RoleId } from "@/lib/permissions/roles";

export function MentionText({
  text,
  catalog,
  roleColors,
}: {
  text: string;
  catalog: MentionTarget[];
  roleColors: Record<RoleId, string>;
}) {
  const matches = findMentions(text, catalog);
  if (matches.length === 0) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  matches.forEach((m, idx) => {
    if (m.start > cursor) parts.push(text.slice(cursor, m.start));
    const label = m.target.kind === "all" ? "all" : m.target.label;
    const color =
      m.target.kind === "all"
        ? "rgb(var(--red))"
        : m.target.kind === "role"
        ? roleColors[m.target.roleId]
        : colorForId(m.target.userId);
    parts.push(
      <span
        key={idx}
        className="font-semibold rounded px-1"
        style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
      >
        @{label}
      </span>
    );
    cursor = m.end;
  });

  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
