"use client";

import { useEffect, useState } from "react";
import { CommentDeleteButton } from "./comment-delete-button";
import { relativeTime } from "@/lib/relative-time";
import { initialsFor } from "@/lib/avatar";
import { ExpandIcon, CloseIcon } from "@/components/ui/icons";
import { MentionInput } from "@/components/ui/mention-input";
import { MentionText } from "@/components/ui/mention-text";
import type { MentionTarget } from "@/lib/mentions";
import type { RoleId } from "@/lib/permissions/roles";

export type CommentDisplay = {
  id: string;
  name: string;
  avatarColor: string;
  roles: { name: string; color: string }[];
  createdAt: string;
  body: string;
  canDelete: boolean;
};

export function NotesPanel({
  stageLabel,
  comments,
  canComment,
  projectId,
  postAction,
  mentionCatalog,
  roleColors,
}: {
  stageLabel: string;
  comments: CommentDisplay[];
  canComment: boolean;
  projectId: string;
  postAction: (formData: FormData) => void;
  mentionCatalog: MentionTarget[];
  roleColors: Record<RoleId, string>;
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);

  function handleSend(text: string) {
    const fd = new FormData();
    fd.set("body", text);
    postAction(fd);
  }

  function renderList(maxHeightClass: string) {
    return (
      <div className={`space-y-3 mb-3 overflow-y-auto ${maxHeightClass}`}>
        {comments.length === 0 && (
          <p className="text-[12px] text-ink-faint">
            No notes on this stage yet.
          </p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="relative flex gap-2 border-b border-line/10 pb-2.5 pr-5 last:border-none">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 mt-0.5"
              style={{ background: c.avatarColor }}
            >
              {initialsFor(c.name)}
            </span>
            <div className="text-[12.5px] min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold">{c.name}</span>
                {c.roles.map((r) => (
                  <span
                    key={r.name}
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded border"
                    style={{
                      color: r.color,
                      borderColor: `color-mix(in srgb, ${r.color} 45%, transparent)`,
                      background: `color-mix(in srgb, ${r.color} 12%, transparent)`,
                    }}
                  >
                    {r.name}
                  </span>
                ))}
              </div>
              <div className="text-ink-soft leading-relaxed mt-0.5">
                <MentionText text={c.body} catalog={mentionCatalog} roleColors={roleColors} />
              </div>
              <div className="text-[10.5px] text-ink-soft mt-1">
                {relativeTime(c.createdAt)}
              </div>
            </div>
            {c.canDelete && (
              <div className="absolute top-0 right-0">
                <CommentDeleteButton commentId={c.id} projectId={projectId} />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  function renderComposer() {
    return canComment ? (
      <MentionInput
        catalog={mentionCatalog}
        roleColors={roleColors}
        placeholder="Leave a note… (@ to mention)"
        onSubmit={handleSend}
      />
    ) : (
      <p className="text-[11px] text-ink-faint">
        Only people tagged on this stage (or the master) can post notes here.
      </p>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-line/10 bg-surface p-4 h-fit">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-display font-semibold">
            Notes & Q&A — {stageLabel}
          </div>
          <button
            onClick={() => setExpanded(true)}
            className="text-ink-soft hover:text-ink transition-colors"
            aria-label="Expand notes"
            title="Expand"
          >
            <ExpandIcon className="w-[15px] h-[15px]" />
          </button>
        </div>
        {renderList("max-h-[360px]")}
        {renderComposer()}
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-[250] flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4 sm:p-8"
          onClick={() => setExpanded(false)}
        >
          <div
            className="w-full max-w-2xl h-full max-h-[85vh] rounded-2xl bg-surface border border-line/10 shadow-2xl flex flex-col animate-[modalin_.15s_ease]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-line/10 flex-shrink-0">
              <div className="font-display font-semibold text-[16px]">
                Notes & Q&A — {stageLabel}
              </div>
              <button
                onClick={() => setExpanded(false)}
                className="text-ink-soft hover:text-ink transition-colors"
                aria-label="Close"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {renderList("max-h-none")}
            </div>
            <div className="px-5 py-4 border-t border-line/10 flex-shrink-0">
              {renderComposer()}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
