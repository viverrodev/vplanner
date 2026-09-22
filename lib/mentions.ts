import type { RoleId } from "@/lib/permissions/roles";

export type MentionTarget =
  | { kind: "all" }
  | { kind: "role"; roleId: RoleId; label: string }
  | { kind: "user"; userId: string; label: string };

export function buildMentionCatalog(
  members: { userId: string; name: string }[],
  roles: { id: RoleId; name: string }[]
): MentionTarget[] {
  const catalog: MentionTarget[] = [{ kind: "all" }];
  roles.forEach((r) => catalog.push({ kind: "role", roleId: r.id, label: r.name }));
  members.forEach((m) => catalog.push({ kind: "user", userId: m.userId, label: m.name }));
  return catalog;
}

/**
 * Finds every @mention in a block of text by matching against the
 * team's actual current member names and role names — no special
 * insertion syntax needed, someone can just type "@Alex" or "@Scripter"
 * or "@all" and it resolves correctly, as long as it's exactly one of
 * those names followed by a word boundary. Longest match wins at each
 * position, so a role called "Master" doesn't accidentally swallow a
 * person actually named "Masterson."
 *
 * Known limitation: if two teammates share an exact display name,
 * this can't tell them apart — worth knowing once real profile names
 * are in place.
 */
export function findMentions(text: string, catalog: MentionTarget[]) {
  const matches: { start: number; end: number; target: MentionTarget }[] = [];
  const candidates = catalog
    .map((t) => ({ t, label: t.kind === "all" ? "all" : t.label }))
    .filter((c) => c.label.length > 0)
    .sort((a, b) => b.label.length - a.label.length);

  let i = 0;
  while (i < text.length) {
    if (text[i] === "@") {
      for (const c of candidates) {
        const slice = text.slice(i + 1, i + 1 + c.label.length);
        if (slice.toLowerCase() === c.label.toLowerCase()) {
          const nextChar = text[i + 1 + c.label.length];
          if (!nextChar || /[^a-zA-Z0-9_]/.test(nextChar)) {
            matches.push({ start: i, end: i + 1 + c.label.length, target: c.t });
            i = i + 1 + c.label.length;
            break;
          }
        }
      }
    }
    i++;
  }
  return matches;
}

/**
 * Resolves which real user ids should be notified for a piece of text
 * — a user mention notifies just them, a role mention notifies every
 * team member holding that role, @all notifies everyone.
 */
export function resolveMentionRecipients(
  text: string,
  catalog: MentionTarget[],
  members: { userId: string; roles: RoleId[] }[]
): Set<string> {
  const matches = findMentions(text, catalog);
  const recipients = new Set<string>();

  matches.forEach((m) => {
    if (m.target.kind === "user") {
      recipients.add(m.target.userId);
    } else if (m.target.kind === "role") {
      members.forEach((mem) => {
        if (mem.roles.includes((m.target as { roleId: RoleId }).roleId)) {
          recipients.add(mem.userId);
        }
      });
    } else {
      members.forEach((mem) => recipients.add(mem.userId));
    }
  });

  return recipients;
}
