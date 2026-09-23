"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markNotificationRead,
  markAllNotificationsRead,
  respondToTeamInvite,
} from "@/app/(dashboard)/notification-actions";
import { relativeTime } from "@/lib/relative-time";
import { BellIcon } from "./icons";
import { useToast } from "./toast-provider";

export type NotificationItem = {
  id: string;
  body: string;
  project_id: string | null;
  stage: string | null;
  is_read: boolean;
  created_at: string;
  team_invite_id: string | null;
  team_invites: { status: string } | { status: string }[] | null;
};

function inviteStatus(n: NotificationItem): string | null {
  if (!n.team_invite_id) return null;
  const ti = n.team_invites;
  if (!ti) return null;
  return Array.isArray(ti) ? ti[0]?.status ?? null : ti.status;
}

export function NotificationBell({
  notifications,
}: {
  notifications: NotificationItem[];
}) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const toast = useToast();
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleClick(n: NotificationItem) {
    if (n.team_invite_id) return; // handled by its own Accept/Decline buttons
    setOpen(false);
    startTransition(() => {
      markNotificationRead(n.id);
    });
    if (n.project_id) {
      router.push(n.stage ? `/videos/${n.project_id}?tab=${n.stage}` : `/videos/${n.project_id}`);
    }
  }

  async function respond(n: NotificationItem, accept: boolean) {
    if (!n.team_invite_id) return;
    setRespondingId(n.id);
    const result = await respondToTeamInvite(n.team_invite_id, accept);
    setRespondingId(null);
    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success(accept ? "You joined the team" : "Invite declined");
      markNotificationRead(n.id);
      router.refresh();
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:bg-surface-2 hover:text-ink transition-colors"
        aria-label="Notifications"
      >
        <BellIcon className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red" />
        )}
      </button>

      {open && (
        <div className="absolute top-[calc(100%+8px)] right-0 w-[340px] max-w-[90vw] rounded-xl border border-line/10 bg-surface shadow-xl overflow-hidden z-40 animate-[modalin_.12s_ease]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line/10">
            <span className="font-display font-semibold text-[13.5px]">
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={() => startTransition(() => markAllNotificationsRead())}
                className="text-[11.5px] font-semibold text-amber"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[380px] overflow-y-auto styled-scroll">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-[12.5px] text-ink-faint">
                Nothing yet.
              </div>
            ) : (
              notifications.map((n) => {
                const status = inviteStatus(n);
                const isPendingInvite = n.team_invite_id && status === "pending";
                return (
                  <div
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`flex gap-2.5 px-4 py-3 border-b border-line/10 last:border-none transition-colors ${
                      n.team_invite_id ? "" : "hover:bg-surface-2 cursor-pointer"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                        n.is_read ? "bg-transparent" : "bg-amber"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="block text-[12.5px] leading-snug text-ink">
                        {n.body}
                      </span>
                      <span className="block text-[10.5px] text-ink-soft mt-1">
                        {relativeTime(n.created_at)}
                      </span>
                      {isPendingInvite && (
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              respond(n, true);
                            }}
                            disabled={respondingId === n.id}
                            className="rounded-md bg-amber text-white text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50"
                          >
                            Accept
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              respond(n, false);
                            }}
                            disabled={respondingId === n.id}
                            className="rounded-md border border-line/15 text-ink-soft text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50"
                          >
                            Decline
                          </button>
                        </div>
                      )}
                      {n.team_invite_id && status && status !== "pending" && (
                        <span className="inline-block mt-1.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
                          {status}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
