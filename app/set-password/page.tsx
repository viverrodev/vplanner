"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setPending(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPending(false);

    if (updateError) {
      setError("Couldn't set your password — try again, or ask for a fresh invite.");
      return;
    }

    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-line/10 bg-surface p-8 shadow-sm">
        <div className="text-sm font-bold tracking-wide text-amber mb-6">VPlanner</div>
        <h1 className="font-display text-2xl font-semibold mb-2">
          Welcome — set your password
        </h1>
        <p className="text-sm text-ink-soft mb-7">
          You&rsquo;ve accepted a team invite. Pick a password to finish
          setting up your account.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-lg border border-line/15 bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1.5">
              Confirm password
            </label>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-lg border border-line/15 bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber"
            />
          </div>

          {error && <p className="text-sm text-red font-medium">{error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-amber text-white font-semibold py-2.5 text-sm disabled:opacity-50"
          >
            {pending ? "Saving…" : "Set password & continue"}
          </button>
        </form>
      </div>
    </main>
  );
}
