import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);

  if (!currentTeam) {
    return (
      <div className="min-h-[calc(100vh-57px)] flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="font-display text-3xl font-semibold mb-3">
            Start your first team
          </h1>
          <p className="text-sm text-ink-soft leading-relaxed mb-7">
            A team is where your projects, teammates, and roles live —
            your main channel, for instance. You&rsquo;ll be its owner,
            with full access to every stage of every project by default.
          </p>
          <Link
            href="/teams/new"
            className="inline-flex items-center justify-center rounded-lg bg-amber text-white font-semibold px-5 py-2.5 text-sm hover:brightness-105 transition-[filter]"
          >
            Create your team
          </Link>
        </div>
      </div>
    );
  }

  const { count: memberCount } = await supabase
    .from("team_members")
    .select("id", { count: "exact", head: true })
    .eq("team_id", currentTeam.id)
    .eq("status", "active");

  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      <h1 className="font-display text-3xl font-semibold mb-1.5">
        {currentTeam.name}
      </h1>
      <p className="text-sm text-ink-soft mb-10">
        {memberCount ?? 1} member{(memberCount ?? 1) === 1 ? "" : "s"}
      </p>

      <div className="rounded-xl border border-line/10 bg-surface p-7">
        <p className="font-display text-lg font-medium mb-2">
          The long-form video pipeline is next
        </p>
        <p className="text-sm text-ink-soft leading-relaxed max-w-md">
          This is where project creation, the ideate-through-publish
          pipeline, roles, and the calendar all land. The foundation
          underneath — teams, roles, permissions, notifications — is
          already built and enforced at the database level; this screen
          is next in line to build on top of it.
        </p>
      </div>
    </div>
  );
}
