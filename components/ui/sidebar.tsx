import Link from "next/link";
import { WorkspaceSwitcher } from "./workspace-switcher";
import type { TeamSummary } from "@/lib/teams";
import { initialsFor } from "@/lib/avatar";
import { NAV_ITEMS } from "@/lib/nav-items";

export function Sidebar({
  teams,
  currentTeam,
  userDisplayName,
}: {
  teams: TeamSummary[];
  currentTeam: TeamSummary;
  userDisplayName: string;
}) {
  return (
    <aside className="hidden md:flex w-[236px] flex-shrink-0 border-r border-line/10 bg-surface flex-col p-3.5 gap-1 h-screen sticky top-0 overflow-y-auto">
      <div className="mb-4">
        <WorkspaceSwitcher teams={teams} currentTeam={currentTeam} />
      </div>

      <div className="px-1 pb-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">
        Workspace
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) =>
          item.available ? (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-semibold text-ink-soft hover:bg-surface-2 hover:text-ink transition-colors"
            >
              <span className="w-[18px] text-center text-[15px]">
                {item.icon}
              </span>
              {item.label}
            </Link>
          ) : (
            <div
              key={item.href}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-semibold text-ink-faint cursor-default"
              title="Coming soon"
            >
              <span className="w-[18px] text-center text-[15px] opacity-60">
                {item.icon}
              </span>
              {item.label}
              <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-ink-faint/70">
                Soon
              </span>
            </div>
          )
        )}
      </nav>

      <div className="mt-auto pt-3 border-t border-line/10">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <span className="w-7 h-7 rounded-full bg-amber flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
            {initialsFor(userDisplayName)}
          </span>
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold truncate">
              {userDisplayName}
            </span>
          </span>
        </div>
      </div>
    </aside>
  );
}
