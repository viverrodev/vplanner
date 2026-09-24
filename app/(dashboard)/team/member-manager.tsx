"use client";

import { useState, useTransition } from "react";
import { setMemberRoles, kickMember } from "./actions";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { ROLES } from "@/lib/permissions/roles";
import type { RoleId } from "@/lib/permissions/roles";
import { initialsFor } from "@/lib/avatar";

export type MemberRow = {
  teamMemberId: string;
  userId: string | null;
  username: string | null;
  avatarUrl: string | null;
  name: string;
  email: string;
  status: "invited" | "active";
  roles: RoleId[];
  isOwner: boolean;
  color: string;
};

export function MemberManager({
  teamId,
  member,
  roleColors,
  isSelf,
  viewerIsOwner,
}: {
  teamId: string;
  member: MemberRow;
  roleColors: Record<RoleId, string>;
  isSelf: boolean;
  viewerIsOwner: boolean;
}) {
  const memberIsMaster = member.roles.includes("master");
  // Only the owner can remove a Master from the team.
  const canKick = !member.isOwner && (viewerIsOwner || !memberIsMaster);
  const [open, setOpen] = useState(false);
  const [draftRoles, setDraftRoles] = useState<RoleId[]>(member.roles);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const toast = useToast();

  function toggleRole(r: RoleId) {
    setDraftRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  }

  function saveRoles() {
    startTransition(async () => {
      const result = await setMemberRoles(teamId, member.teamMemberId, draftRoles);
      if (result?.error) toast.error(result.error);
      else {
        toast.success(`${member.name}'s roles updated`);
        setOpen(false);
      }
    });
  }

  async function handleKick() {
    const ok = await confirm({
      title: `Remove ${member.name}?`,
      description: "They'll lose access to this team immediately and be unassigned from any active projects.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await kickMember(teamId, member.teamMemberId);
      if (result?.error) toast.error(result.error);
      else toast.success(`${member.name} removed`);
    });
  }

  return (
    <div className="border-b border-line/10 last:border-none">
      <div className="flex items-center gap-3 py-3 flex-wrap">
        {member.username ? (
          <a href={`/u/${member.username}`} className="flex-shrink-0">
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white hover:opacity-80 transition-opacity overflow-hidden"
              style={{ background: member.color }}
            >
              {member.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img loading="lazy" decoding="async" src={member.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                initialsFor(member.name)
              )}
            </span>
          </a>
        ) : (
          <span
            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 overflow-hidden"
            style={{ background: member.color }}
          >
            {member.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img loading="lazy" decoding="async" src={member.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              initialsFor(member.name)
            )}
          </span>
        )}
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold flex items-center gap-1.5">
            {member.username ? (
              <a href={`/u/${member.username}`} className="hover:text-amber transition-colors">
                {member.name}
              </a>
            ) : (
              member.name
            )}
            {member.isOwner && <span className="text-amber text-[11px]">★ Owner</span>}
            {member.status === "invited" && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-ink-faint bg-surface-2 px-1.5 py-0.5 rounded">
                Invited
              </span>
            )}
          </div>
          <div className="text-[11.5px] text-ink-faint">{member.email}</div>
        </div>
        <div className="flex flex-wrap gap-1 ml-1">
          {member.roles.length === 0 && (
            <span className="text-[11px] text-ink-faint">No role</span>
          )}
          {member.roles.map((r) => (
            <span
              key={r}
              className="text-[10.5px] font-bold px-1.5 py-0.5 rounded border"
              style={{
                color: roleColors[r],
                borderColor: `color-mix(in srgb, ${roleColors[r]} 45%, transparent)`,
                background: `color-mix(in srgb, ${roleColors[r]} 12%, transparent)`,
              }}
            >
              {ROLES.find((role) => role.id === r)?.name}
            </span>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          {isSelf ? (
            <span className="text-[11px] text-ink-faint">This is you</span>
          ) : (
            <>
              <button
                onClick={() => setOpen((o) => !o)}
                className="text-[11.5px] font-semibold text-ink-soft hover:text-ink"
              >
                {open ? "Close" : "Manage"}
              </button>
              {canKick && (
                <button
                  onClick={handleKick}
                  disabled={pending}
                  className="text-[11.5px] font-semibold text-ink-soft hover:text-red disabled:opacity-40"
                >
                  Remove
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {open && !isSelf && (
        <div className="pb-4 pl-11">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {ROLES.map((r) => {
              const active = draftRoles.includes(r.id);
              const ownerLocked = r.id === "master" && member.isOwner;
              const locked = ownerLocked || (r.id === "master" && !viewerIsOwner);
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={locked}
                  onClick={() => !locked && toggleRole(r.id)}
                  title={
                    ownerLocked
                      ? "The team owner is always Master"
                      : locked
                        ? "Only the team owner can grant or remove Master"
                        : undefined
                  }
                  className={`rounded-full px-3 py-1 text-[11.5px] font-semibold border transition-colors ${
                    active ? "text-white" : "border-line/15 text-ink-soft"
                  } ${locked ? "opacity-60 cursor-not-allowed" : ""}`}
                  style={active ? { background: roleColors[r.id], borderColor: roleColors[r.id] } : undefined}
                >
                  {r.name}
                  {locked && " 🔒"}
                </button>
              );
            })}
          </div>
          <button
            onClick={saveRoles}
            disabled={pending}
            className="rounded-lg bg-amber text-white text-[12px] font-semibold px-3.5 py-1.5 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save roles"}
          </button>
        </div>
      )}
    </div>
  );
}
