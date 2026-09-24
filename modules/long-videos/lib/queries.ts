import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * One project row, fetched at most ONCE per request — generateMetadata
 * (the browser tab title) and the page itself both call this, and cache()
 * makes the second call free instead of a duplicate query.
 * RLS applies: returns null if the viewer isn't on the project's team.
 */
export const getProject = cache(async (id: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("long_video_projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data;
});
