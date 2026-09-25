"use client";

import { useEffect, useState } from "react";
import { assignShortPerson, updateShortDetails } from "../actions";
import { useAction } from "@/lib/hooks/use-action";
import { PLATFORM_META, type Platform, type ShortType } from "@/modules/short-videos/lib/constants";
import { ShortTypePicker, ShortTypeTag, Switch } from "@/modules/short-videos/components/short-type";
import { FinalFileField } from "@/modules/short-videos/components/final-file-field";
import type { DatedShort, TeamPerson } from "@/modules/short-videos/lib/queries";
import type { ShortPermissions } from "@/modules/short-videos/lib/permissions";
import { ScheduleField, type ScheduleValue } from "@/modules/short-videos/components/schedule-field";
import { PersonSelect, type PersonKind } from "@/modules/short-videos/components/person-select";
import { useConfirm } from "@/components/ui/confirm-provider";
import { CopyButton } from "@/modules/short-videos/components/copy-button";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { formatShortDate } from "@/modules/short-videos/lib/dates";

type Person = { memberId: string; name: string; avatarUrl: string | null; color: string } | null;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-4 border-t border-line/10 first:border-t-0 first:pt-0">
      <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint mb-2">{label}</div>
      {children}
    </div>
  );
}

/**
 * Every field saves on its own, instantly — no Save button to forget.
 * Fields you can't change are shown read-only.
 */
export function DetailsCard({
  id,
  perms,
  plannedDate,
  scheduleMode,
  pinKind,
  perDay,
  weekends,
  limits,
  queueStart,
  editor,
  reviewer,
  scheduler,
  platforms,
  fileLink,
  caption,
  captionEnabled,
  shortType,
  people,
  planned,
}: {
  id: string;
  perms: ShortPermissions;
  plannedDate: string | null;
  scheduleMode: "auto" | "pinned";
  pinKind: "anchor" | "oneoff" | null;
  perDay: number;
  weekends: boolean;
  limits: Record<string, number>;
  queueStart: { id: string; number: number; date: string } | null;
  editor: Person;
  reviewer: Person;
  scheduler: Person;
  platforms: Platform[];
  fileLink: string | null;
  caption: string | null;
  captionEnabled: boolean;
  shortType: ShortType;
  people: TeamPerson[];
  planned: DatedShort[];
}) {
  const serverSchedule: ScheduleValue =
    scheduleMode === "pinned" && plannedDate
      ? { mode: "pinned", date: plannedDate, kind: pinKind ?? "anchor" }
      : { mode: "auto" };
  const [schedule, setSchedule] = useState<ScheduleValue>(serverSchedule);
  const [who, setWho] = useState({
    editor: editor?.memberId ?? null,
    reviewer: reviewer?.memberId ?? null,
    scheduler: scheduler?.memberId ?? null,
  });
  const [cap, setCap] = useState(caption ?? "");
  const [capOn, setCapOn] = useState(captionEnabled);
  const [type, setType] = useState<ShortType>(shortType);
  const confirm = useConfirm();

  // Server changes (someone else edited, the queue moved it) flow back in.
  useEffect(() => setSchedule(serverSchedule), [scheduleMode, plannedDate, pinKind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => setWho({ editor: editor?.memberId ?? null, reviewer: reviewer?.memberId ?? null, scheduler: scheduler?.memberId ?? null }),
    [editor?.memberId, reviewer?.memberId, scheduler?.memberId]
  );
  useEffect(() => setCap(caption ?? ""), [caption]);
  useEffect(() => setCapOn(captionEnabled), [captionEnabled]);
  useEffect(() => setType(shortType), [shortType]);

  const save = useAction(updateShortDetails, {
    onError: () => {
      setSchedule(serverSchedule);
      setCap(caption ?? "");
      setCapOn(captionEnabled);
      setType(shortType);
    },
  });
  const assign = useAction(assignShortPerson, {
    success: (_id, role, m) => (m ? `${role[0].toUpperCase()}${role.slice(1)} set. They've been notified` : `${role[0].toUpperCase()}${role.slice(1)} cleared`),
    onError: () =>
      setWho({ editor: editor?.memberId ?? null, reviewer: reviewer?.memberId ?? null, scheduler: scheduler?.memberId ?? null }),
  });

  async function changePerson(kind: PersonKind, memberId: string | null) {
    const name = memberId ? people.find((p) => p.memberId === memberId)?.name ?? "them" : null;
    const ok = await confirm({
      title: name ? `Make ${name} the ${kind}?` : `Remove the ${kind}?`,
      description: name ? "They'll get a notification about this short." : undefined,
      confirmLabel: name ? "Confirm" : "Remove",
    });
    if (!ok) return;
    setWho((w) => ({ ...w, [kind]: memberId }));
    assign.run(id, kind, memberId);
  }


  return (
    <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-6">
      <Row label="Post date">
        {perms.canEditSchedule ? (
          <ScheduleField
            value={schedule}
            onChange={(v) => {
              setSchedule(v);
              if (v.mode === "auto") save.run(id, { auto: true });
              else if (schedule.mode === "pinned" && schedule.date === v.date) save.run(id, { pin_kind: v.kind });
              else save.run(id, { planned_date: v.date, pin_kind: v.kind });
            }}
            autoDate={scheduleMode === "auto" ? plannedDate : null}
            autoLabel="Auto-scheduled for"
            planned={planned}
            perDay={perDay}
            weekends={weekends}
            limits={limits}
            queueStart={queueStart}
            canStartQueue={perms.canStartQueue}
            excludeId={id}
          />
        ) : (
          <p className="text-[14px] font-semibold">
            {plannedDate ? formatShortDate(plannedDate, { withYear: true }) : <span className="text-ink-faint font-normal">Not planned yet</span>}
            <span className="ml-2 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
              {scheduleMode === "auto" ? "Auto" : pinKind === "oneoff" ? "Fixed, just this one" : "Fixed, starts the queue"}
            </span>
            {scheduleMode === "pinned" && perms.canEditBasics && (
              <span className="block mt-1 text-[12px] font-normal text-ink-soft">Only the master can change a fixed date.</span>
            )}
          </p>
        )}
      </Row>

      <Row label="People">
        <div className="grid gap-4 sm:grid-cols-3">
          {([
            ["editor", "Editor", editor],
            ["reviewer", "Reviewer", reviewer],
            ["scheduler", "Scheduler", scheduler],
          ] as const).map(([kind, label, current]) => (
            <div key={kind} className="min-w-0">
              <div className="text-[11.5px] font-semibold text-ink-soft mb-1.5">{label}</div>
              {perms.canAssignPeople ? (
                <PersonSelect kind={kind} people={people} value={who[kind]} onChange={(m) => changePerson(kind, m)} />
              ) : current ? (
                <div className="flex items-center gap-2 min-w-0">
                  <PersonAvatar name={current.name} avatarUrl={current.avatarUrl} color={current.color} className="w-7 h-7 text-[10px]" />
                  <span className="text-[13.5px] font-semibold truncate">{current.name}</span>
                </div>
              ) : (
                <p className="text-[13px] text-ink-faint">
                  {kind === "editor" ? "Not assigned" : kind === "reviewer" ? "Any master" : "Any scheduler"}
                </p>
              )}
            </div>
          ))}
        </div>
      </Row>

      <Row label="Type">
        {perms.canEditBasics ? (
          <ShortTypePicker
            value={type}
            onChange={(t) => {
              setType(t);
              save.run(id, { short_type: t });
            }}
          />
        ) : (
          <ShortTypeTag type={type} showFiller />
        )}
      </Row>

      <Row label="Final file">
        <FinalFileField id={id} link={fileLink} canEdit={perms.canEditFileLink} />
      </Row>

      <Row label="Caption">
        {perms.canEditCaption ? (
          <Switch
            checked={capOn}
            onChange={(v) => {
              setCapOn(v);
              save.run(id, { caption_enabled: v });
            }}
            label="Custom caption"
            hint="Off uses the automatic caption."
          />
        ) : (
          <p className="text-[13.5px] text-ink-soft">{capOn ? "Custom caption" : "Automatic caption"}</p>
        )}
        {capOn && (
          <div className="mt-3">
            {perms.canEditCaption ? (
              <textarea
                aria-label="Caption"
                value={cap}
                onChange={(e) => setCap(e.target.value)}
                onBlur={() => cap.trim() !== (caption ?? "") && save.run(id, { caption: cap })}
                maxLength={5000}
                rows={4}
                placeholder="Caption + hashtags"
                className="w-full rounded-lg border border-line/15 bg-surface px-3 py-2.5 text-[13.5px] outline-none focus:ring-2 focus:ring-amber resize-y"
              />
            ) : cap ? (
              <p className="text-[13.5px] whitespace-pre-wrap">{cap}</p>
            ) : (
              <p className="text-[13.5px] text-ink-soft">No caption written yet.</p>
            )}
            <div className="flex items-center justify-between gap-2 mt-1.5 flex-wrap">
              <div className="flex items-center gap-2.5 flex-wrap">
                {platforms.map((p) => {
                  const over = cap.trim().length > PLATFORM_META[p].captionLimit;
                  return (
                    <span key={p} className={`text-[11px] tabular-nums ${over ? "text-red font-bold" : "text-ink-soft"}`} title={`${PLATFORM_META[p].name} limit`}>
                      {PLATFORM_META[p].short} {cap.trim().length}/{PLATFORM_META[p].captionLimit}
                    </span>
                  );
                })}
              </div>
              <CopyButton text={cap.trim()} label="Copy caption" toastText="Caption copied" />
            </div>
          </div>
        )}
      </Row>
    </section>
  );
}
