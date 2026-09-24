"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EMPTY_RESPONSE, type SearchResponse } from "./types";

const DEBOUNCE_MS = 140;

/**
 * Debounced search against the global_search() database function.
 *
 * - Calls Supabase directly from the browser (RLS protects it — the
 *   function runs as the signed-in user), skipping a hop through Vercel.
 * - Remembers answers for this session, so backspacing is instant.
 * - Ignores out-of-order responses: only the latest query ever renders.
 */
export function useGlobalSearch(query: string, enabled: boolean) {
  const [data, setData] = useState<SearchResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const cache = useRef(new Map<string, SearchResponse>());
  const latest = useRef(0);

  const term = query.trim().toLowerCase();

  useEffect(() => {
    if (!enabled) return;
    const cached = cache.current.get(term);
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(false);
      return;
    }

    const requestId = ++latest.current;
    setLoading(true);
    const timer = setTimeout(
      async () => {
        const { data: res, error: err } = await createClient().rpc("global_search", {
          q: term,
          max_results: 6,
        });
        if (requestId !== latest.current) return; // a newer query won
        if (err || !res) {
          setError(true);
          setLoading(false);
          return;
        }
        const parsed = res as SearchResponse;
        cache.current.set(term, parsed);
        setData(parsed);
        setError(false);
        setLoading(false);
      },
      // Empty query (just loading "teams you can invite into") → no wait.
      term.length < 2 ? 0 : DEBOUNCE_MS
    );
    return () => clearTimeout(timer);
  }, [term, enabled]);

  /** Patch a person locally (e.g. after sending them an invite). */
  function patchPerson(id: string, change: (p: SearchResponse["people"][number]) => SearchResponse["people"][number]) {
    setData((d) => ({ ...d, people: d.people.map((p) => (p.id === id ? change(p) : p)) }));
    cache.current.clear(); // statuses changed — don't serve stale answers
  }

  return { data, loading, error, term, patchPerson };
}
