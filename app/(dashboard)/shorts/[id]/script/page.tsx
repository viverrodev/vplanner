import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";
import { relativeTime } from "@/lib/relative-time";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { getShortDetail } from "@/modules/short-videos/lib/queries";
import { getOrCreateShortScript } from "@/modules/scripts/lib/queries";
import { ScriptEditor } from "@/modules/scripts/components/script-editor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const short = await getShortDetail(id);
  return { title: short ? `Script · #${short.number} ${short.title}` : "Script" };
}

export default async function ShortScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const short = await getShortDetail(id);
  if (!short) notFound();

  const supabase = await createClient();
  const membership = await getMembership(supabase, short.teamId);
  const roles = membership?.roles ?? [];
  // Masters and scripters write scripts, at any stage.
  const canEdit = isMaster(roles) || roles.includes("scripter");

  const script = await getOrCreateShortScript(id, canEdit);

  if (!script) {
    return (
      <div className="px-4 sm:px-10 py-8 max-w-2xl mx-auto">
        <Link href={`/shorts/${id}`} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink mb-5">
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          #{short.number} {short.title}
        </Link>
        <p className="rounded-xl border border-line/10 bg-surface px-5 py-4 text-[13.5px] text-ink-soft">
          No script has been written for this short yet.
        </p>
      </div>
    );
  }

  return (
    <ScriptEditor
      scriptId={script.id}
      teamId={script.teamId}
      initialContent={script.content}
      initialVersion={script.version}
      canEdit={canEdit}
      title={short.title}
      number={short.number}
      backHref={`/shorts/${id}`}
      backLabel="Back to the short"
      lastEdited={
        script.updatedBy && script.version > 1
          ? `Last edited by ${script.updatedBy.name}, ${relativeTime(script.updatedAt)}`
          : null
      }
    />
  );
}
