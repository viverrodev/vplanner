import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

// Deliberately minimal for now — this proves the auth + data pipeline
// end to end (real session, real RLS-protected query). The actual
// VPlanner shell (sidebar, workspace switcher, nav, topbar) gets built
// next, on top of the finished design system.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user!.id)
    .single();

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-black/10 dark:border-white/10 px-6 py-3">
        <div className="text-sm font-bold tracking-wide">VPLANNER</div>
        <div className="flex items-center gap-3 text-sm">
          <span className="opacity-70">
            {profile?.full_name ?? user?.email}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg border border-black/15 dark:border-white/15 px-3 py-1.5 text-xs font-semibold"
            >
              Log out
            </button>
          </form>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
