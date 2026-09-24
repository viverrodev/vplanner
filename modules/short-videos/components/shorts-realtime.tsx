"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps a shorts page live: when a teammate changes a short (or marks a
 * platform posted), refresh once — debounced, so a burst of changes is
 * one refresh. Realtime respects RLS, so only your team's rows arrive.
 */
export function ShortsRealtime({ teamId, shortId }: { teamId: string; shortId?: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };

    const channel = supabase
      .channel(`shorts:${teamId}:${shortId ?? "all"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "short_videos",
          filter: shortId ? `id=eq.${shortId}` : `team_id=eq.${teamId}`,
        },
        refresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "short_video_posts",
          ...(shortId ? { filter: `short_id=eq.${shortId}` } : {}),
        },
        refresh
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [teamId, shortId, router]);

  return null;
}
