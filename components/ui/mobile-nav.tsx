"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { NAV_ITEMS } from "@/lib/nav-items";
import type { TeamSummary } from "@/lib/teams";
import { initialsFor } from "@/lib/avatar";

export function MobileTopBar({
  teams,
  currentTeam,
  userDisplayName,
  userAvatarUrl,
  userColor,
}: {
  teams: TeamSummary[];
  currentTeam: TeamSummary | null;
  userDisplayName: string;
  userAvatarUrl: string | null;
  userColor: string;
}) {
  return (
    <div className="md:hidden border-b border-line/10 px-4 py-2.5 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <WorkspaceSwitcher teams={teams} currentTeam={currentTeam} />
      </div>
      <Link
        href="/settings"
        aria-label="Settings"
        className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 overflow-hidden"
        style={{ background: userColor }}
      >
        {userAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={userAvatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          initialsFor(userDisplayName)
        )}
      </Link>
    </div>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface border-t border-line/10 flex"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {NAV_ITEMS.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        if (!item.available) {
          return (
            <div
              key={item.href}
              className="flex-1 flex flex-col items-center gap-0.5 py-2 text-ink-faint"
            >
              <span className="text-[16px] opacity-50">{item.icon}</span>
              <span className="text-[9.5px] font-bold">
                {item.label.split(" ")[0]}
              </span>
            </div>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors ${
              active ? "text-amber" : "text-ink-faint"
            }`}
          >
            <span className="text-[16px]">{item.icon}</span>
            <span className="text-[9.5px] font-bold">
              {item.label.split(" ")[0]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
