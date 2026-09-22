import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/get-user";
import { getTeamsAndCurrent } from "@/lib/teams";
import { Sidebar } from "@/components/ui/sidebar";
import { MobileTopBar, MobileBottomNav } from "@/components/ui/mobile-nav";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ToastProvider } from "@/components/ui/toast-provider";
import { ConfirmProvider } from "@/components/ui/confirm-provider";
import { NotificationBell } from "@/components/ui/notification-bell";
import { displayName } from "@/lib/avatar";
import { signOut } from "./actions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const user = await getCachedUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user!.id)
    .single();

  const { teams, currentTeam } = await getTeamsAndCurrent(supabase);

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, body, project_id, stage, is_read, created_at")
    .eq("recipient_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(25);

  // No team yet — no sidebar to switch between, just a minimal frame
  // around whatever the page (the "create your first team" flow) shows.
  if (!currentTeam) {
    return (
      <ToastProvider>
        <ConfirmProvider>
          <div className="min-h-screen">
            <header className="flex items-center justify-between border-b border-line/10 px-4 sm:px-6 py-3.5 gap-2">
              <span className="font-display font-semibold text-[15px] tracking-tight">
                VPlanner
              </span>
              <div className="flex items-center gap-1.5 sm:gap-2">
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
              </div>
            </header>
            <main>{children}</main>
          </div>
        </ConfirmProvider>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="min-h-screen flex">
          <Sidebar
            teams={teams}
            currentTeam={currentTeam}
            userDisplayName={displayName(profile?.full_name, profile?.email ?? user?.email)}
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
            <MobileTopBar teams={teams} currentTeam={currentTeam} />
            <main className="flex-1 pb-16 md:pb-0">{children}</main>
            <MobileBottomNav />
          </div>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
