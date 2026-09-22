"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { NAV_ITEMS } from "@/lib/nav-items";
import type { TeamSummary } from "@/lib/teams";

export function MobileTopBar({
  teams,
  currentTeam,
}: {
  teams: TeamSummary[];
  currentTeam: TeamSummary;
}) {
  return (
    <div className="md:hidden border-b border-line/10 px-4 py-2.5">
      <WorkspaceSwitcher teams={teams} currentTeam={currentTeam} />
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
