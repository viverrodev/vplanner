import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "./server";
import {
  VERIFIED_USER_ID_HEADER,
  VERIFIED_USER_EMAIL_HEADER,
} from "./middleware";

export type CurrentUser = { id: string; email: string | null };

/**
 * The logged-in user for this request — used for RENDERING decisions
 * (whose notifications, which buttons to show). Row Level Security is
 * still what actually protects the data.
 *
 * Fast path: middleware already verified the session with Supabase Auth
 * on this exact request and forwarded the result in a header it controls
 * (see lib/supabase/middleware.ts), so no second network round trip.
 * Fallback: if the header isn't there, verify directly.
 *
 * Server ACTIONS that make security decisions still call
 * supabase.auth.getUser() themselves — keep it that way.
 *
 * Wrapped in cache(): one resolution per request, never shared between
 * users or requests.
 */
export const getCachedUser = cache(async (): Promise<CurrentUser | null> => {
  const h = await headers();
  const id = h.get(VERIFIED_USER_ID_HEADER);
  if (id) {
    const rawEmail = h.get(VERIFIED_USER_EMAIL_HEADER);
    return { id, email: rawEmail ? decodeURIComponent(rawEmail) : null };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? null } : null;
});
