"use client";

import { useTransition } from "react";
import { setRoleColor } from "./actions";
import { useToast } from "@/components/ui/toast-provider";
import { ROLES } from "@/lib/permissions/roles";
import type { RoleId } from "@/lib/permissions/roles";

export function RoleColorPicker({
  teamId,
  roleColors,
}: {
  teamId: string;
  roleColors: Record<RoleId, string>;
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleChange(role: RoleId, color: string) {
    startTransition(async () => {
      const result = await setRoleColor(teamId, role, color);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {ROLES.map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-2.5 rounded-lg border border-line/10 px-3 py-2.5"
        >
          <label className="relative w-7 h-7 rounded-md flex-shrink-0 cursor-pointer overflow-hidden border border-line/15">
            <input
              type="color"
              disabled={pending}
              defaultValue={roleColors[r.id]?.startsWith("#") ? roleColors[r.id] : "#888888"}
              onChange={(e) => handleChange(r.id, e.target.value)}
              className="absolute -top-1 -left-1 w-9 h-9 cursor-pointer"
            />
          </label>
          <span className="text-[12.5px] font-semibold">{r.name}</span>
        </div>
      ))}
    </div>
  );
}
