"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "./icons";

export function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/dashboard"))}
      className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[14px] font-semibold text-ink-faint hover:text-ink transition-colors"
    >
      <ArrowLeftIcon className="w-4 h-4" />
      Go back
    </button>
  );
}
