"use client";

import { useEffect, useState } from "react";
import { updateShortDetails } from "../actions";
import { useAction } from "@/lib/hooks/use-action";
import { PlatformPicker } from "@/modules/short-videos/components/platform-picker";
import type { Platform } from "@/modules/short-videos/lib/constants";

/** Where it will be posted. Becomes the Posted card once it's approved. */
export function PostToCard({ id, platforms, canEdit }: { id: string; platforms: Platform[]; canEdit: boolean }) {
  const [plats, setPlats] = useState(platforms);
  useEffect(() => setPlats(platforms), [platforms]);
  const save = useAction(updateShortDetails, { onError: () => setPlats(platforms) });

  return (
    <section className="rounded-2xl border border-line/10 bg-surface p-5">
      <h2 className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-3">Post to</h2>
      <PlatformPicker
        value={plats}
        disabled={!canEdit}
        onChange={(next) => {
          setPlats(next);
          save.run(id, { platforms: next });
        }}
      />
    </section>
  );
}
