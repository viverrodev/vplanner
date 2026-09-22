"use client";

import { useRef, useState } from "react";
import type { MentionTarget } from "@/lib/mentions";
import { colorForId } from "@/lib/avatar";
import type { RoleId } from "@/lib/permissions/roles";

export function MentionInput({
  catalog,
  roleColors,
  placeholder,
  onSubmit,
}: {
  catalog: MentionTarget[];
  roleColors: Record<RoleId, string>;
  placeholder: string;
  onSubmit: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function targetColor(t: MentionTarget) {
    if (t.kind === "all") return "rgb(var(--amber))";
    if (t.kind === "role") return roleColors[t.roleId];
    return colorForId(t.userId);
  }
  function targetLabel(t: MentionTarget) {
    return t.kind === "all" ? "everyone" : t.label;
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setValue(v);
    const cursor = e.target.selectionStart ?? v.length;
    const upToCursor = v.slice(0, cursor);
    const atIndex = upToCursor.lastIndexOf("@");
    if (atIndex !== -1 && !/\s/.test(upToCursor.slice(atIndex + 1))) {
      setQuery(upToCursor.slice(atIndex + 1));
    } else {
      setQuery(null);
    }
  }

  function selectTarget(t: MentionTarget) {
    const label = targetLabel(t);
    const cursor = inputRef.current?.selectionStart ?? value.length;
    const upToCursor = value.slice(0, cursor);
    const atIndex = upToCursor.lastIndexOf("@");
    if (atIndex === -1) return;
    const before = value.slice(0, atIndex);
    const after = value.slice(cursor);
    setValue(`${before}@${label} ${after}`);
    setQuery(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const filtered =
    query === null
      ? []
      : catalog
          .filter((t) => targetLabel(t).toLowerCase().includes(query.toLowerCase()))
          .slice(0, 8);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    onSubmit(value.trim());
    setValue("");
    setQuery(null);
  }

  return (
    <form onSubmit={handleSubmit} className="relative flex gap-1.5">
      {query !== null && filtered.length > 0 && (
        <div className="absolute bottom-[calc(100%+6px)] left-0 w-64 max-h-56 overflow-y-auto rounded-lg border border-line/10 bg-surface shadow-lg z-30 p-1">
          {filtered.map((t, i) => {
            const color = targetColor(t);
            return (
              <button
                type="button"
                key={i}
                onClick={() => selectTarget(t)}
                className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-surface-2 text-left"
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                <span style={{ color }} className="font-semibold">
                  @{targetLabel(t)}
                </span>
                {t.kind === "role" && (
                  <span className="text-ink-faint text-[10.5px] ml-auto">role</span>
                )}
                {t.kind === "all" && (
                  <span className="text-ink-faint text-[10.5px] ml-auto">everyone</span>
                )}
              </button>
            );
          })}
        </div>
      )}
      <input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className="flex-1 rounded-lg border border-line/15 bg-surface-2 px-2.5 py-1.5 text-[12.5px] outline-none focus:ring-2 focus:ring-amber"
      />
      <button
        type="submit"
        className="rounded-lg bg-amber text-white text-[12px] font-semibold px-3 py-1.5"
      >
        Send
      </button>
    </form>
  );
}
