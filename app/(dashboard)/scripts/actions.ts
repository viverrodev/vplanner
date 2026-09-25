"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type SaveResult =
  | { ok: true; version: number; updatedAt: string }
  | { ok: false; conflict: true }
  | { ok: false; error: string };

const MAX_JSON = 1_900_000;

/**
 * Save a script only if nobody else saved since `expectedVersion`
 * (compare-and-swap). The database bumps the version by one.
 */
export async function saveScript(input: {
  scriptId: string;
  expectedVersion: number;
  content: unknown;
  text: string;
  wordCount: number;
  path?: string;
}): Promise<SaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  const json = JSON.stringify(input.content ?? {});
  if (json.length > MAX_JSON) return { ok: false, error: "This script is too big to save. Remove some images or text." };
  const text = String(input.text ?? "").slice(0, 500_000);
  const words = Math.max(0, Math.min(1_000_000, Math.round(Number(input.wordCount) || 0)));

  const { data, error } = await supabase
    .from("scripts")
    .update({ content: JSON.parse(json), content_text: text, word_count: words })
    .eq("id", input.scriptId)
    .eq("version", input.expectedVersion)
    .select("version, updated_at");

  if (error) return { ok: false, error: "Couldn't save. You may not have permission to edit this script." };
  if (!data || data.length === 0) {
    // Either someone saved first, or the script is gone / not yours to edit.
    const { data: row } = await supabase.from("scripts").select("version").eq("id", input.scriptId).maybeSingle();
    return row ? { ok: false, conflict: true } : { ok: false, error: "This script no longer exists." };
  }

  if (input.path && /^\/(shorts|videos)\/[0-9a-f-]{36}$/.test(input.path)) revalidatePath(input.path);
  return { ok: true, version: data[0].version as number, updatedAt: data[0].updated_at as string };
}
