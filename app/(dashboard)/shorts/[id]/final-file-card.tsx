import { FinalFileField } from "@/modules/short-videos/components/final-file-field";

/** The Frame.io link, on the steps that use it. */
export function FinalFileCard({
  id,
  link,
  canEdit,
  hint,
}: {
  id: string;
  link: string | null;
  canEdit: boolean;
  hint?: string;
}) {
  return (
    <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5">
      <h2 className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-2.5">Final file</h2>
      <FinalFileField id={id} link={link} canEdit={canEdit} />
      {hint && <p className="mt-2 text-[12px] text-ink-soft">{hint}</p>}
    </section>
  );
}
