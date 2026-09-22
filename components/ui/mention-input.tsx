"use client";

import { useEffect, useRef, useState } from "react";
import type { MentionTarget } from "@/lib/mentions";
import { colorForId } from "@/lib/avatar";
import type { RoleId } from "@/lib/permissions/roles";
import { useToast } from "./toast-provider";
import { ArrowRightIcon } from "./icons";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

const EMOJI = [
  "😀","😂","😅","😊","😉","😍","🤔","😎","😢","😭","😡","🥳","👍","👎","👏","🙌",
  "🙏","💪","🔥","✨","🎉","✅","❌","⚠️","❤️","💯","👀","🤝","🚀","📌","📝","🎬",
  "🎥","📷","🖥️","💡","⏰","📅","🗓️","💰","🏆","👋","😴","🤯","🫡","😬","🙃",
];

export function MentionInput({
  catalog,
  roleColors,
  placeholder,
  onSubmit,
}: {
  catalog: MentionTarget[];
  roleColors: Record<RoleId, string>;
  placeholder: string;
  onSubmit: (text: string, files: File[]) => void;
}) {
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  const [menuView, setMenuView] = useState<"closed" | "menu" | "emoji">("closed");
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuView("closed");
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function targetColor(t: MentionTarget) {
    if (t.kind === "all") return "rgb(var(--red))";
    if (t.kind === "role") return roleColors[t.roleId];
    return colorForId(t.userId);
  }
  function targetLabel(t: MentionTarget) {
    return t.kind === "all" ? "everyone" : t.label;
  }

  // People show as soon as you type "@". Roles (and @everyone) only show
  // once you've actually typed something that matches one — an empty "@"
  // shouldn't dump every role in your face immediately.
  const peopleMatches =
    query === null
      ? []
      : catalog
          .filter((t) => t.kind === "user" && targetLabel(t).toLowerCase().includes(query.toLowerCase()))
          .slice(0, 6);
  const roleMatches =
    query === null || query.length === 0
      ? []
      : catalog
          .filter((t) => t.kind !== "user" && targetLabel(t).toLowerCase().includes(query.toLowerCase()))
          .slice(0, 5);
  const filtered = [...peopleMatches, ...roleMatches];

  function updateQueryFromCursor(v: string, cursor: number) {
    const upToCursor = v.slice(0, cursor);
    const atIndex = upToCursor.lastIndexOf("@");
    if (atIndex !== -1 && !/\s/.test(upToCursor.slice(atIndex + 1))) {
      setQuery(upToCursor.slice(atIndex + 1));
      setHighlighted(0);
    } else {
      setQuery(null);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setValue(v);
    updateQueryFromCursor(v, e.target.selectionStart ?? v.length);
  }

  function insertAtCursor(text: string) {
    const el = inputRef.current;
    const cursor = el?.selectionStart ?? value.length;
    const next = value.slice(0, cursor) + text + value.slice(cursor);
    setValue(next);
    const pos = cursor + text.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  function selectTarget(t: MentionTarget) {
    const label = targetLabel(t);
    const cursor = inputRef.current?.selectionStart ?? value.length;
    const upToCursor = value.slice(0, cursor);
    const atIndex = upToCursor.lastIndexOf("@");
    if (atIndex === -1) return;
    const before = value.slice(0, atIndex);
    const after = value.slice(cursor);
    const inserted = `@${label} `;
    setValue(`${before}${inserted}${after}`);
    setQuery(null);
    const pos = before.length + inserted.length;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (query !== null && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        selectTarget(filtered[highlighted]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setQuery(null);
        return;
      }
    }
  }

  function handleFiles(list: FileList | null) {
    if (!list) return;
    const accepted: File[] = [];
    Array.from(list).forEach((f) => {
      if (f.size > MAX_FILE_BYTES) {
        toast.error(`${f.name} is over 25MB — skipped.`);
        return;
      }
      accepted.push(f);
    });
    setFiles((cur) => [...cur, ...accepted]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(i: number) {
    setFiles((cur) => cur.filter((_, idx) => idx !== i));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() && files.length === 0) return;
    onSubmit(value.trim(), files);
    setValue("");
    setFiles([]);
    setQuery(null);
  }

  return (
    <div>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {files.map((f, i) => (
            <span
              key={i}
              className="flex items-center gap-1.5 rounded-full border border-line/15 bg-surface-2 pl-2 pr-1.5 py-1 text-[11px] font-medium"
            >
              {f.name.length > 20 ? `${f.name.slice(0, 17)}…` : f.name}
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="text-ink-faint hover:text-red"
                aria-label={`Remove ${f.name}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="relative flex items-center gap-1.5">
        {query !== null && filtered.length > 0 && (
          <div className="absolute bottom-[calc(100%+6px)] left-0 w-64 max-h-64 overflow-y-auto styled-scroll rounded-lg border border-line/10 bg-surface shadow-lg z-30 p-1">
            {filtered.map((t, i) => {
              const color = targetColor(t);
              const active = i === highlighted;
              const isFirstRole = i === peopleMatches.length && roleMatches.length > 0;
              return (
                <div key={i}>
                  {isFirstRole && (
                    <div className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-ink-faint">
                      Roles
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => selectTarget(t)}
                    onMouseEnter={() => setHighlighted(i)}
                    className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-left transition-colors ${
                      active ? "bg-surface-2" : ""
                    }`}
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
                </div>
              );
            })}
          </div>
        )}

        {/*
          Plain, single-layer input — no transparent-text-over-backdrop
          trick anymore. That approach relied on a separate div staying
          pixel-perfectly in sync with the real input's font metrics and
          internal scroll behavior, and it never quite did, which is
          exactly what caused the "cursor in one place, text somewhere
          else" bug. One layer means nothing to desync. Mentions still
          render in full color once a message is actually sent.
        */}
        <input
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={(e) => updateQueryFromCursor(value, e.currentTarget.selectionStart ?? value.length)}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-line/15 bg-surface-2 px-2.5 py-1.5 text-[12.5px] outline-none focus:ring-2 focus:ring-amber"
        />

        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuView((v) => (v === "closed" ? "menu" : "closed"))}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[16px] font-bold text-ink-soft hover:bg-surface-2 hover:text-ink transition-colors"
            aria-label="Add emoji, file, or GIF"
            title="Add"
          >
            +
          </button>

          {menuView === "menu" && (
            <div className="absolute bottom-[calc(100%+6px)] right-0 z-30 w-44 rounded-lg border border-line/10 bg-surface shadow-lg p-1 animate-[modalin_.12s_ease]">
              <button
                type="button"
                onClick={() => setMenuView("emoji")}
                className="w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-[12.5px] font-medium hover:bg-surface-2"
              >
                🙂 Emoji
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuView("closed");
                  fileInputRef.current?.click();
                }}
                className="w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-[12.5px] font-medium hover:bg-surface-2"
              >
                📎 Attach file
                <span className="text-ink-faint text-[10.5px] ml-auto">≤25MB</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuView("closed");
                  toast.error("GIF search needs a free Tenor or GIPHY API key first.");
                }}
                className="w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-[12.5px] font-medium hover:bg-surface-2"
              >
                🎞️ GIF
                <span className="text-ink-faint text-[10.5px] ml-auto">Set up</span>
              </button>
            </div>
          )}

          {menuView === "emoji" && (
            <div className="absolute bottom-[calc(100%+6px)] right-0 z-30 w-64 max-h-52 overflow-y-auto styled-scroll rounded-lg border border-line/10 bg-surface shadow-lg p-2 grid grid-cols-8 gap-0.5 animate-[modalin_.12s_ease]">
              {EMOJI.map((e, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    insertAtCursor(e);
                    setMenuView("closed");
                  }}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-[16px] hover:bg-surface-2"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="submit"
          aria-label="Send"
          className="w-8 h-8 rounded-lg bg-amber text-white flex items-center justify-center flex-shrink-0 hover:brightness-110 transition-[filter]"
        >
          <ArrowRightIcon className="w-4 h-4" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </form>
    </div>
  );
}
