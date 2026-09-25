"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast-provider";

export function CopyButton({ text, label = "Copy", toastText }: { text: string; label?: string; toastText?: string }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(toastText ?? "Copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it manually.");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      disabled={!text}
      className="inline-flex items-center gap-1 rounded-md px-2 h-7 text-[11.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-40 transition-colors"
    >
      {copied ? <CheckIcon className="w-3.5 h-3.5 text-green" /> : <CopyIcon className="w-3.5 h-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}
