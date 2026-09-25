"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createProject } from "./actions";
import { ArrowLeftIcon } from "@/components/ui/icons";

const TYPES = ["Hub", "Help", "Hero"];

export function NewVideoForm() {
  const [state, formAction, pending] = useActionState(
    createProject,
    undefined
  );

  // Every field lives in React state, not just the DOM. That's the fix
  // for the actual bug: relying on the browser to remember uncontrolled
  // input values across a failed-submission re-render is fragile — this
  // way nothing typed can ever be lost, no matter what re-renders.
  const [types, setTypes] = useState<string[]>([]);
  const [theme, setTheme] = useState("");
  const [subtheme, setSubtheme] = useState("");
  const [titles, setTitles] = useState<string[]>(["", "", ""]);
  const [picked, setPicked] = useState(0);
  const [hook, setHook] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [budgetNotes, setBudgetNotes] = useState("");

  function toggleType(t: string) {
    setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  }
  function updateTitle(i: number, value: string) {
    setTitles((cur) => cur.map((t, idx) => (idx === i ? value : t)));
  }

  return (
    <div className="p-4 sm:p-8 max-w-2xl">
      <Link
        href="/videos"
        className="flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink mb-5"
      >
        <ArrowLeftIcon className="w-3.5 h-3.5" />
        Long videos
      </Link>

      <h1 className="font-display text-3xl font-semibold mb-1.5">
        New video idea
      </h1>
      <p className="text-sm text-ink-soft mb-8">
        Starts in Ideate. Everyone on the team can pitch an idea. The
        master reviews and moves it forward.
      </p>

      <form action={formAction} className="space-y-7">
        <div>
          <label className="block text-xs font-semibold text-ink-soft mb-2">
            Type
          </label>
          <div className="flex gap-2">
            {TYPES.map((t) => (
              <label
                key={t}
                className="flex items-center gap-1.5 rounded-lg border border-line/15 px-3 py-1.5 text-sm font-medium cursor-pointer has-[:checked]:border-amber has-[:checked]:bg-amber/10 has-[:checked]:text-amber transition-colors"
              >
                <input
                  type="checkbox"
                  name="type"
                  value={t}
                  checked={types.includes(t)}
                  onChange={() => toggleType(t)}
                  className="sr-only"
                />
                {t}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="theme"
              className="block text-xs font-semibold text-ink-soft mb-1.5"
            >
              Theme
            </label>
            <input
              id="theme"
              name="theme"
              type="text"
              required
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="TECH"
              className="w-full rounded-lg border border-line/15 bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber"
            />
          </div>
          <div>
            <label
              htmlFor="subtheme"
              className="block text-xs font-semibold text-ink-soft mb-1.5"
            >
              Subtheme
            </label>
            <input
              id="subtheme"
              name="subtheme"
              type="text"
              value={subtheme}
              onChange={(e) => setSubtheme(e.target.value)}
              placeholder="Scam Help"
              className="w-full rounded-lg border border-line/15 bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-semibold text-ink-soft">
              Titles (2 to 5, star your favorite)
            </label>
            {titles.length < 5 && (
              <button
                type="button"
                onClick={() => setTitles((cur) => [...cur, ""])}
                className="text-xs font-semibold text-amber"
              >
                + Add another
              </button>
            )}
          </div>
          <div className="space-y-2">
            {titles.map((titleValue, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="pickedTitle"
                  value={i}
                  checked={picked === i}
                  onChange={() => setPicked(i)}
                  className="accent-amber flex-shrink-0"
                  aria-label={`Use title ${i + 1} as the main title`}
                />
                <input
                  name="titles"
                  type="text"
                  required={i < 2}
                  value={titleValue}
                  onChange={(e) => updateTitle(i, e.target.value)}
                  placeholder={`Title option ${i + 1}`}
                  className="flex-1 rounded-lg border border-line/15 bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber"
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="hook"
            className="block text-xs font-semibold text-ink-soft mb-1.5"
          >
            Hook
          </label>
          <textarea
            id="hook"
            name="hook"
            required
            rows={3}
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            placeholder="What's the first thing said on screen?"
            className="w-full rounded-lg border border-line/15 bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber resize-none"
          />
        </div>

        <div>
          <label
            htmlFor="expected_date"
            className="block text-xs font-semibold text-ink-soft mb-1.5"
          >
            Expected date
          </label>
          <input
            id="expected_date"
            name="expected_date"
            type="date"
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
            className="w-full rounded-lg border border-line/15 bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber"
          />
        </div>

        <p className="text-[11.5px] text-ink-faint -mt-3">
          You&rsquo;ll add at least 2 thumbnail sketches after creating it.
        </p>

        <div>
          <label
            htmlFor="notes"
            className="block text-xs font-semibold text-ink-soft mb-1.5"
          >
            Notes <span className="text-ink-faint font-normal">(optional)</span>
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-line/15 bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber resize-none"
          />
        </div>

        <div>
          <label
            htmlFor="budget_notes"
            className="block text-xs font-semibold text-ink-soft mb-1.5"
          >
            Budget needed{" "}
            <span className="text-ink-faint font-normal">
              (optional, but add at least a rough idea)
            </span>
          </label>
          <textarea
            id="budget_notes"
            name="budget_notes"
            rows={2}
            value={budgetNotes}
            onChange={(e) => setBudgetNotes(e.target.value)}
            placeholder="e.g. Fake iPhone 17 Pro Max: 1000–1500 RON"
            className="w-full rounded-lg border border-line/15 bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber resize-none"
          />
        </div>

        {state?.error && (
          <p className="text-sm text-red font-medium">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center rounded-lg bg-amber text-white font-semibold px-5 py-2.5 text-sm disabled:opacity-50 hover:brightness-110 transition-[filter]"
        >
          {pending ? "Creating…" : "Create project"}
        </button>
      </form>
    </div>
  );
}
