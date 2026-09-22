"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationRead, markAllNotificationsRead } from "@/app/(dashboard)/notification-actions";
import { relativeTime } from "@/lib/relative-time";
import { BellIcon } from "./icons";

export type NotificationItem = {
  id: string;
  body: string;
  project_id: string | null;
  stage: string | null;
  is_read: boolean;
  created_at: string;
};

export function NotificationBell({
  notifications,
}: {
  notifications: NotificationItem[];
}) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleClick(n: NotificationItem) {
    setOpen(false);
    startTransition(() => {
      markNotificationRead(n.id);
    });
    if (n.project_id) {
      router.push(n.stage ? `/videos/${n.project_id}?tab=${n.stage}` : `/videos/${n.project_id}`);
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
          <div className="max-h-[380px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-[12.5px] text-ink-faint">
                Nothing yet.
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className="w-full text-left flex gap-2.5 px-4 py-3 border-b border-line/10 last:border-none hover:bg-surface-2 transition-colors"
                >
                  <span
                    className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                      n.is_read ? "bg-transparent" : "bg-amber"
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] leading-snug text-ink">
                      {n.body}
                    </span>
                    <span className="block text-[10.5px] text-ink-soft mt-1">
                      {relativeTime(n.created_at)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
