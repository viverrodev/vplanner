"use client";

import type { TeamPerson } from "../lib/queries";

/** Native select (great on phones) — editors first, then everyone else. */
export function EditorSelect({
  people,
  value,
  onChange,
  disabled,
}: {
  people: TeamPerson[];
  value: string | null;
  onChange: (memberId: string | null) => void;
  disabled?: boolean;
}) {
  const editors = people.filter((p) => p.roles.includes("editor"));
  const others = people.filter((p) => !p.roles.includes("editor"));

  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full sm:w-auto sm:min-w-[260px] rounded-lg border border-line/15 bg-surface px-3 h-10 text-[14px] outline-none focus:ring-2 focus:ring-amber disabled:opacity-60"
    >
      <option value="">No editor yet</option>
      {editors.length > 0 && (
        <optgroup label="Editors">
          {editors.map((p) => (
            <option key={p.memberId} value={p.memberId}>
              {p.name}
            </option>
          ))}
        </optgroup>
      )}
      {others.length > 0 && (
        <optgroup label={editors.length > 0 ? "Other teammates" : "Teammates"}>
          {others.map((p) => (
            <option key={p.memberId} value={p.memberId}>
              {p.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
