const PALETTE = [
  "#E8630D",
  "#178C7C",
  "#3159C9",
  "#6B4FD6",
  "#B84070",
  "#B4890E",
  "#2B9757",
];

export function colorForId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function initialsFor(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Prefers username, then a real full name, then falls back to the part
 * of the email before the @ rather than the full address. Now that
 * Settings lets everyone set a username, that's the primary identity
 * going forward — the other fallbacks matter less over time.
 */
export function displayName(
  username: string | null | undefined,
  fullName: string | null | undefined,
  email: string | null | undefined
): string {
  if (username && username.trim()) return username.trim();
  if (fullName && fullName.trim()) return fullName.trim();
  if (email) return email.split("@")[0];
  return "Unnamed";
}
