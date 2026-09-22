import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, slug")
    .order("created_at", { ascending: true });

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Welcome, {user?.email}</h1>
      <p className="text-sm opacity-70 mb-8">
        This confirms your session, Supabase connection, and Row Level
        Security are all wired up correctly. The real dashboard UI comes
        next.
      </p>

      <h2 className="text-sm font-bold uppercase tracking-wide opacity-60 mb-3">
        Your teams
      </h2>

      {teams && teams.length > 0 ? (
        <ul className="space-y-2">
          {teams.map((t) => (
            <li
              key={t.id}
              className="rounded-lg border border-black/10 dark:border-white/10 px-4 py-3 text-sm font-medium"
            >
              {t.name}
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed border-black/15 dark:border-white/15 px-4 py-8 text-center text-sm opacity-70">
          No teams yet. Team creation UI is next on the list.
        </div>
      )}
    </div>
  );
}
