import { isMaster, type RoleId } from "@/lib/permissions/roles";
import type { ShortStage } from "./constants";

/**
 * What the signed-in person may do on one short. Mirrors the database
 * guard (short_guard_update / RLS in 0026) so the UI only offers actions
 * that will actually succeed. The database remains the real boundary.
 */
export function shortPermissions({
  roles,
  isAssignedEditor,
  isAssignedReviewer = false,
  stage,
  scheduleMode = "auto",
}: {
  roles: RoleId[];
  isAssignedEditor: boolean;
  isAssignedReviewer?: boolean;
  stage: ShortStage;
  scheduleMode?: "auto" | "pinned";
}) {
  const master = isMaster(roles);
  const scheduler = roles.includes("publisher");

  return {
    isMaster: master,
    canCreate: master || scheduler,
    canEditBasics: master || scheduler, // the Settings window: people, date, type, platforms, caption, file
    // Fixed dates and the queue start are the master's. A scheduler can
    // give an Auto short a date (as "Just this one").
    canEditSchedule: master || (scheduler && scheduleMode === "auto"),
    canStartQueue: master,
    canEditCaption: master || scheduler,
    canEditFileLink: master || isAssignedEditor || scheduler,
    canAssignEditor: master,
    canAssignPeople: master || scheduler, // editor, reviewer, scheduler
    canReorder: master,
    canSendToEditing: master && stage === "script",
    canSubmitForReview: (master || isAssignedEditor) && stage === "editing",
    canReview: (master || isAssignedReviewer) && stage === "review",
    canMarkPosted: (master || scheduler) && (stage === "ready" || stage === "posted"),
    // Posted is final for everyone; un-mark a platform to reopen.
    canMoveAnywhere: master && stage !== "posted",
    canDelete: master,
  };
}

export type ShortPermissions = ReturnType<typeof shortPermissions>;
