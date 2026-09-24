"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMenuKeyboard } from "@/lib/hooks/use-menu-keyboard";
import { moveShortStage, reviewShort, sendShortToEditing } from "../actions";
import { useAction } from "@/lib/hooks/use-action";
import { useConfirm } from "@/components/ui/confirm-provider";
import { ArrowRightIcon, CheckIcon, ChevronDownIcon } from "@/components/ui/icons";
import { MarkDoneButton } from "@/modules/short-videos/components/mark-done-button";
import { SHORT_STAGE_LABELS, type ShortStage } from "@/modules/short-videos/lib/constants";
import type { ShortPermissions } from "@/modules/short-videos/lib/permissions";

/**
 * The one obvious next step for YOU on this short — Send to editing,
 * Mark done, Approve / Needs changes — or a hint about who it's waiting
 * on. Masters also get a small "Move to…" menu for corrections.
 */
export function WorkflowActions({
  id,
  number,
  stage,
  perms,
  hasEditor,
  editorName,
  reviewerName,
}: {
  id: string;
  number: number;
  stage: ShortStage;
  perms: ShortPermissions;
  hasEditor: boolean;
  editorName: string | null;
  reviewerName: string | null;
}) {
  const confirm = useConfirm();
  const [changesOpen, setChangesOpen] = useState(false);
  const [note, setNote] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const toEditing = useAction(sendShortToEditing, {
    success: `Sent to editing — ${editorName ?? "the editor"} has been notified`,
  });
  const review = useAction<Parameters<typeof reviewShort>, Awaited<ReturnType<typeof reviewShort>>>(reviewShort, {
    success: (_id, decision) =>
      decision === "approve" ? "Approved — the scheduler has been notified" : "Sent back with your note",
    onSuccess: () => {
      setChangesOpen(false);
      setNote("");
    },
  });

  useEffect(() => {
    if (changesOpen) noteRef.current?.focus();
  }, [changesOpen]);

  async function handleSendToEditing() {
    const ok = await confirm({
      title: `Send #${number} to editing?`,
      description: `${editorName ?? "The editor"} will get a notification that it's ready for them.`,
      confirmLabel: "Send to editing",
    });
    if (ok) toEditing.run(id);
  }

  async function handleApprove() {
    const ok = await confirm({
      title: `Approve #${number}?`,
      description: "It moves to Ready to post, and the editor and scheduler are notified.",
      confirmLabel: "Approve",
    });
    if (ok) review.run(id, "approve");
  }

  let primary: React.ReactNode = null;
  let hint: string | null = null;

  if (stage === "script") {
    if (perms.canSendToEditing) {
      primary = (
        <button
          type="button"
          onClick={handleSendToEditing}
          disabled={!hasEditor || toEditing.pending}
          title={hasEditor ? undefined : "Assign an editor first"}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber text-white font-bold px-3.5 h-9 text-[13px] disabled:opacity-45 hover:brightness-110 transition-[filter]"
        >
          {toEditing.pending ? "Sending…" : "Send to editing"}
          <ArrowRightIcon className="w-4 h-4" />
        </button>
      );
      if (!hasEditor) hint = "Assign an editor below first.";
    } else hint = "Waiting for the master to send it to editing.";
  } else if (stage === "editing") {
    if (perms.canSubmitForReview) primary = <MarkDoneButton shortId={id} number={number} />;
    else hint = `${editorName ?? "The editor"} is editing this.`;
  } else if (stage === "review") {
    if (perms.canReview) {
      primary = (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={review.pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green text-white font-bold px-3.5 h-9 text-[13px] disabled:opacity-50 hover:brightness-110 transition-[filter]"
          >
            <CheckIcon className="w-4 h-4" />
            Approve
          </button>
          <button
            type="button"
            onClick={() => setChangesOpen((o) => !o)}
            disabled={review.pending}
            aria-expanded={changesOpen}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 h-9 text-[13px] font-bold transition-colors ${
              changesOpen ? "border-amber bg-amber/10 text-amber" : "border-line/20 text-ink-soft hover:text-ink hover:border-line/35"
            }`}
          >
            Needs changes
          </button>
        </div>
      );
    } else hint = reviewerName ? `Waiting for ${reviewerName}'s review.` : "Waiting for the master's review.";
  } else if (stage === "ready") {
    hint = perms.canMarkPosted ? "Approved — mark each platform below as you post it." : "Approved and waiting to be posted.";
  } else if (stage === "posted") {
    hint = "Posted and locked. Un-mark a platform below to reopen it.";
  }

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-2.5">
        {primary}
        {hint && <span className="text-[12.5px] text-ink-faint">{hint}</span>}
        {perms.canMoveAnywhere && <MoveToMenu id={id} stage={stage} />}
      </div>

      {changesOpen && perms.canReview && (
        <div className="mt-3 rounded-xl border border-amber/40 bg-amber/5 p-3.5 max-w-xl animate-[modalin_.14s_ease]">
          <label htmlFor="changes-note" className="block text-[12px] font-bold text-ink-soft mb-1.5">
            What needs changing? The editor sees this.
          </label>
          <textarea
            id="changes-note"
            ref={noteRef}
            value={note}
            maxLength={2000}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) review.run(id, "changes", note);
              if (e.key === "Escape") setChangesOpen(false);
            }}
            rows={3}
            placeholder="e.g. Cut the first 2 seconds, captions are off at 0:14"
            className="w-full rounded-lg border border-line/15 bg-surface px-3 py-2 text-[13.5px] outline-none focus:ring-2 focus:ring-amber resize-y"
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={() => review.run(id, "changes", note)}
              disabled={review.pending || !note.trim()}
              className="rounded-lg bg-amber text-white font-bold px-3.5 h-9 text-[13px] disabled:opacity-45"
            >
              {review.pending ? "Sending…" : "Send back to editing"}
            </button>
            <button type="button" onClick={() => setChangesOpen(false)} className="rounded-lg px-3 h-9 text-[13px] font-semibold text-ink-faint hover:text-ink">
              Cancel
            </button>
            <span className="hidden sm:inline ml-auto text-[11px] text-ink-faint">Ctrl/⌘ + Enter to send</span>
          </div>
        </div>
      )}
    </div>
  );
}

const MOVABLE: ShortStage[] = ["script", "editing", "review", "ready"];

function MoveToMenu({ id, stage }: { id: string; stage: ShortStage }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();
  const closeMenu = useCallback(() => setOpen(false), []);
  useMenuKeyboard(open, menuRef, triggerRef, closeMenu);
  const move = useAction(moveShortStage, {
    success: (_id, to) => `Moved to ${SHORT_STAGE_LABELS[to]}`,
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  async function pick(to: ShortStage) {
    setOpen(false);
    const ok = await confirm({
      title: `Move to ${SHORT_STAGE_LABELS[to]}?`,
      description: "A manual correction — nobody is notified. Use the buttons for the normal flow.",
      confirmLabel: `Move to ${SHORT_STAGE_LABELS[to]}`,
    });
    if (ok) move.run(id, to);
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-lg px-2.5 h-9 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber transition-colors"
      >
        Move to
        <ChevronDownIcon className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Move to stage"
          className="absolute left-0 top-[calc(100%+4px)] z-30 w-52 rounded-xl border border-line/15 bg-surface shadow-xl p-1 animate-[modalin_.12s_ease]"
        >
          {MOVABLE.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              disabled={s === stage}
              onClick={() => pick(s)}
              className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-[13px] text-left hover:bg-surface-2 focus:bg-surface-2 focus:outline-none disabled:opacity-40 disabled:hover:bg-transparent"
            >
              {SHORT_STAGE_LABELS[s]}
              {s === stage && <span className="text-[11px] text-ink-faint">current</span>}
            </button>
          ))}
          <p className="px-3 pt-1.5 pb-1 text-[10.5px] text-ink-faint border-t border-line/10 mt-1">
            &ldquo;Posted&rdquo; is automatic once every platform is marked.
          </p>
        </div>
      )}
    </div>
  );
}
