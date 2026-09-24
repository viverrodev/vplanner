import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Uses the SECRET service_role key, which bypasses Row Level Security
 * entirely. Because of that:
 *   - `import "server-only"` above makes the BUILD FAIL if this file is
 *     ever imported into a Client Component — it can't leak by accident.
 *   - Every function that calls this must independently verify the
 *     caller is allowed to do what they're asking BEFORE using it.
 *   - Golden rule: only ever write values the user could NOT have
 *     edited themselves (their verified user id, rows they have no
 *     UPDATE access to, constants). Never trust a user-editable row as
 *     the source of an admin write.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
