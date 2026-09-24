/**
 * Link to someone's profile page. Works for everyone: by username when
 * they've set one (/u/edu4rd), otherwise by their account id — the
 * profile page accepts both.
 */
export function profileHref(p: { username?: string | null; userId?: string | null }) {
  if (p.username) return `/u/${encodeURIComponent(p.username)}`;
  if (p.userId) return `/u/${p.userId}`;
  return null;
}
