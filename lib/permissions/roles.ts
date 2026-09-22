/**
 * Mirrors supabase/migrations/0001_init.sql exactly:
 *   - role_type enum
 *   - pipeline_stage enum
 *   - role_allows_stage() function
 *
 * This is the ONE place the frontend defines what each role can do.
 * The database enforces the same rules independently via RLS — this
 * file is for UI decisions (what to show/hide), not the actual security
 * boundary. Never trust this file alone for anything sensitive.
 */

export const PIPELINE_STAGES = [
  "ideate",
  "research",
  "script",
  "film",
  "edit",
  "package",
  "publish",
  "done",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const ROLES = [
  {
    id: "master",
    name: "Master",
    stages: [
      "ideate",
      "research",
      "script",
      "film",
      "edit",
      "package",
      "publish",
    ] as PipelineStage[],
  },
  { id: "researcher", name: "Researcher", stages: ["research"] as PipelineStage[] },
  { id: "scripter", name: "Scripter", stages: ["script"] as PipelineStage[] },
  { id: "filmer", name: "Filmer", stages: ["film"] as PipelineStage[] },
  { id: "editor", name: "Editor", stages: ["edit"] as PipelineStage[] },
  { id: "packager", name: "Packager", stages: ["package"] as PipelineStage[] },
  { id: "publisher", name: "Publisher", stages: ["publish"] as PipelineStage[] },
] as const;

export type RoleId = (typeof ROLES)[number]["id"];

export function roleAllowsStage(roleId: RoleId, stage: PipelineStage): boolean {
  const role = ROLES.find((r) => r.id === roleId);
  return role ? role.stages.includes(stage) : false;
}

export function isMaster(roleIds: RoleId[]): boolean {
  return roleIds.includes("master");
}

export function hasStageAccess(
  roleIds: RoleId[],
  stage: PipelineStage
): boolean {
  return roleIds.some((r) => roleAllowsStage(r, stage));
}
