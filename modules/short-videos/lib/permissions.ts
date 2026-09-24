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
}: {
  roles: RoleId[];
  isAssignedEditor: boolean;
  isAssignedReviewer?: boolean;
  stage: ShortStage;
}) {
  const master = isMaster(roles);
  const scripter = roles.includes("scripter");
  const scheduler = roles.includes("publisher");
  const inScript = stage === "script";

  return {
    isMaster: master,
    canCreate: master || scripter,
    canEditBasics: master || (scripter && inScript), // title, date, platforms
    canEditCaption: master || scheduler || (scripter && inScript),
    canEditFileLink: master || isAssignedEditor || scheduler,
    canAssignEditor: master,
    canAssignPeople: master, // editor, reviewer, scheduler
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
