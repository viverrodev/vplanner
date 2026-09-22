"use client";

import { useState, useTransition } from "react";
import { inviteMember } from "./actions";
import { useToast } from "@/components/ui/toast-provider";
import { ROLES } from "@/lib/permissions/roles";
import type { RoleId } from "@/lib/permissions/roles";

export function InviteForm({ teamId }: { teamId: string }) {
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<RoleId[]>([]);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function toggleRole(r: RoleId) {
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await inviteMember(teamId, email, roles);
      if (result?.error) toast.error(result.error);
      else {
        toast.success(`Invite sent to ${email}`);
        setEmail("");
        setRoles([]);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@example.com"
          className="flex-1 rounded-lg border border-line/15 bg-surface px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-amber"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-amber text-white font-semibold px-4 py-2 text-[13px] disabled:opacity-50 hover:brightness-110 transition-[filter]"
        >
          {pending ? "Sending…" : "Send invite"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ROLES.filter((r) => r.id !== "master").map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => toggleRole(r.id)}
            className={`rounded-full px-3 py-1 text-[11.5px] font-semibold border transition-colors ${
              roles.includes(r.id)
                ? "border-amber bg-amber/10 text-amber"
                : "border-line/15 text-ink-soft"
            }`}
          >
            {r.name}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-ink-faint">
        They&rsquo;ll get a real email with a secure link to set their password.
        You can grant Master afterward from their row below, if needed.
      </p>
    </form>
  );
}
