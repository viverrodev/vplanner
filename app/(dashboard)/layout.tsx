import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/get-user";
import { getTeamsAndCurrent } from "@/lib/teams";
import { Sidebar } from "@/components/ui/sidebar";
import { MobileTopBar, MobileBottomNav } from "@/components/ui/mobile-nav";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ToastProvider } from "@/components/ui/toast-provider";
import { ConfirmProvider } from "@/components/ui/confirm-provider";
import { NotificationBell } from "@/components/ui/notification-bell";
import { displayName, colorForId } from "@/lib/avatar";
import { signOut } from "./actions";

// Every route under here reads the session and shows per-user data —
// this must never be statically optimized or cached at the Next.js
// level, on top of the Cache-Control header middleware already sets.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const user = await getCachedUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, full_name, email, avatar_url")
    .eq("id", user!.id)
    .single();

  const { teams, currentTeam } = await getTeamsAndCurrent(supabase);

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, body, project_id, stage, is_read, created_at, team_invite_id, team_invites(status)")
    .eq("recipient_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(25);

  const resolvedName = displayName(profile?.username, profile?.full_name, profile?.email ?? user?.email);
  const resolvedEmail = profile?.email ?? user?.email ?? "";
  const resolvedAvatar = profile?.avatar_url ?? null;
  const resolvedColor = colorForId(user!.id);

  // The sidebar now always renders, team or not — WorkspaceSwitcher
  // itself shows a "Create your team" prompt in place of a real
  // switcher when there's nothing to switch between yet. This is what
  // you asked for: a constant, reliable way to see you're actually
  // logged in, rather than a completely different (sidebar-less) shell
  // for that one state.
  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="min-h-screen flex">
          <Sidebar
            teams={teams}
            currentTeam={currentTeam}
            userDisplayName={resolvedName}
            userEmail={resolvedEmail}
            userAvatarUrl={resolvedAvatar}
            userColor={resolvedColor}
            username={profile?.username ?? null}
          />
          <div className="flex-1 min-w-0 flex flex-col">
            <header className="h-14 flex items-center gap-2 sm:gap-4 border-b border-line/10 px-4 sm:px-6 sticky top-0 bg-paper/90 backdrop-blur z-20">
              <span className="font-display font-semibold text-[14px] tracking-tight md:hidden">
                VPlanner
              </span>
              <div className="flex-1" />
              <NotificationBell notifications={notifications ?? []} />
              <ThemeToggle />
              <form action={signOut}>
                <button
                  type="submit"
                  className="rounded-lg border border-line/15 px-3 py-1.5 text-xs font-semibold text-ink-soft hover:text-ink hover:border-line/30 transition-colors"
                >
                  Log out
                </button>
              </form>
            </header>
            <MobileTopBar
              teams={teams}
              currentTeam={currentTeam}
              userDisplayName={resolvedName}
              userAvatarUrl={resolvedAvatar}
              userColor={resolvedColor}
            />
            <main className="flex-1 pb-16 md:pb-0">{children}</main>
            <MobileBottomNav />
          </div>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
