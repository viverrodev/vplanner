import Link from "next/link";
import { WorkspaceSwitcher } from "./workspace-switcher";
import type { TeamSummary } from "@/lib/teams";
import { initialsFor } from "@/lib/avatar";
import { NAV_ITEMS } from "@/lib/nav-items";
import { SettingsIcon } from "./icons";

export function Sidebar({
  teams,
  currentTeam,
  userDisplayName,
  userEmail,
  userAvatarUrl,
  userColor,
  username,
}: {
  teams: TeamSummary[];
  currentTeam: TeamSummary | null;
  userDisplayName: string;
  userEmail: string;
  userAvatarUrl: string | null;
  userColor: string;
  username: string | null;
}) {
  return (
    <aside className="hidden md:flex w-[236px] flex-shrink-0 border-r border-line/10 bg-surface flex-col p-3.5 gap-1 h-screen sticky top-0 overflow-y-auto styled-scroll">
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
        <div className="flex items-center gap-1">
          <Link
            href={username ? `/u/${username}` : "/settings"}
            className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-2 transition-colors flex-1 min-w-0"
          >
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 overflow-hidden"
              style={{ background: userColor }}
            >
              {userAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={userAvatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                initialsFor(userDisplayName)
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold truncate">
                {userDisplayName}
              </span>
              <span className="block text-[10.5px] text-ink-faint truncate">
                {userEmail}
              </span>
            </span>
          </Link>
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-faint hover:bg-surface-2 hover:text-ink transition-colors flex-shrink-0"
          >
            <SettingsIcon className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </aside>
  );
}
