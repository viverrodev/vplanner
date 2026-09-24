import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Escape LIKE wildcards so "/u/a%" can't match every username. */
function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * A profile by handle — a username (case-insensitive, exact) or an
 * account id. Cached per request so the page and its metadata share it.
 */
export const getProfileByHandle = cache(async (rawHandle: string) => {
  let handle = rawHandle;
  try {
    handle = decodeURIComponent(rawHandle);
  } catch {
    /* already decoded / malformed — use as-is */
  }
  const supabase = await createClient();
  const query = supabase
    .from("profiles")
    .select("id, username, full_name, bio, avatar_url, created_at, teams_visible");
  const { data } = UUID_RE.test(handle)
    ? await query.eq("id", handle).maybeSingle()
    : await query.ilike("username", escapeLike(handle)).maybeSingle();
  return data;
});
