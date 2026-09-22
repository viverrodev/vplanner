import type { PipelineStage } from "@/lib/permissions/roles";

export const STAGE_LABELS: Record<PipelineStage, string> = {
  ideate: "Ideate",
  research: "Research",
  script: "Script",
  film: "Film",
  edit: "Edit",
  package: "Package",
  publish: "Publish",
  done: "Done",
};

export const STAGE_ORDER: PipelineStage[] = [
  "ideate",
  "research",
  "script",
  "film",
  "edit",
  "package",
  "publish",
  "done",
];

export const STAGE_COLOR_VAR: Record<PipelineStage, string> = {
  ideate: "--gold",
  research: "--teal",
  script: "--blue",
  film: "--pink",
  edit: "--violet",
  package: "--coral",
  publish: "--green",
  done: "--amber",
};

export function stageColor(stage: PipelineStage) {
  return `rgb(var(${STAGE_COLOR_VAR[stage]}))`;
}

export function formatDate(iso: string | null) {
  if (!iso) return "No date set";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
