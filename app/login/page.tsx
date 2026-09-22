"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-black/10 dark:border-white/10 bg-surface p-8 shadow-sm">
        <div className="mb-7">
          <div className="text-sm font-bold tracking-wide">VPLANNER</div>
          <h1 className="text-2xl font-bold mt-2">Sign in</h1>
          <p className="text-sm opacity-70 mt-1">
            Accounts are created by your team&rsquo;s owner. No public
            sign-up.
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold opacity-70 mb-1.5">
              Email
            </label>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-lg border border-black/15 dark:border-white/15 bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold opacity-70 mb-1.5">
              Password
            </label>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-black/15 dark:border-white/15 bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber"
            />
          </div>

          {state?.error && (
            <p className="text-sm text-red font-medium">{state.error}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-amber text-black font-semibold py-2.5 text-sm disabled:opacity-50"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
