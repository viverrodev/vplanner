"use client";

import { useActionState } from "react";
import { updateProfile } from "./actions";

export function ProfileForm({
  username,
  fullName,
  bio,
}: {
  username: string | null;
  fullName: string | null;
  bio: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateProfile, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-ink-soft mb-1.5">Username</label>
        <div className="flex items-center rounded-lg border border-line/15 bg-surface overflow-hidden focus-within:ring-2 focus-within:ring-amber">
          <span className="pl-3 text-ink-faint text-sm">@</span>
          <input
            name="username"
            defaultValue={username ?? ""}
            placeholder="yourname"
            className="flex-1 bg-transparent px-1.5 py-2 text-sm outline-none"
          />
        </div>
        <p className="text-[11px] text-ink-faint mt-1">
          3 to 20 letters, numbers or underscores. Shown instead of your email.
        </p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-ink-soft mb-1.5">Full name</label>
        <input
          name="full_name"
          defaultValue={fullName ?? ""}
          placeholder="Your real name (optional)"
          className="w-full rounded-lg border border-line/15 bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-ink-soft mb-1.5">Bio</label>
        <textarea
          name="bio"
          defaultValue={bio ?? ""}
          rows={3}
          placeholder="A short line about you (optional)"
          className="w-full rounded-lg border border-line/15 bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber resize-none"
        />
      </div>

      {state?.error && <p className="text-sm text-red font-medium">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-amber text-white font-semibold px-4 py-2 text-sm disabled:opacity-50 hover:brightness-110 transition-[filter]"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
