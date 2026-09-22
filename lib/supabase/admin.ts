import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Uses the SECRET service_role key, which bypasses Row Level Security
 * entirely. Because of that:
 *   - This must NEVER be imported into a Client Component or anything
 *     that ends up in the browser bundle.
 *   - Every function that calls this must independently verify the
 *     caller is actually allowed to do what they're asking (e.g. "is
 *     this person the team's master?") BEFORE using it — this client
 *     itself enforces nothing.
 *   - SUPABASE_SERVICE_ROLE_KEY (no NEXT_PUBLIC_ prefix) lives only in
 *     server environment variables and is never sent to the client.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
