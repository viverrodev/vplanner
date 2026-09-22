import { cache } from "react";
import { createClient } from "./server";

/**
 * Wrapped in React's cache() so that within a single page render, every
 * call site (the layout, the page, getTeamsAndCurrent, getMembership...)
 * that needs to know who's logged in shares ONE actual network round
 * trip to Supabase, instead of each one independently re-verifying the
 * session. Scoped per-request — never leaks between different users or
 * different page loads.
 */
export const getCachedUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
