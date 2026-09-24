import type { PipelineStage } from "@/lib/permissions/roles";

export type SearchTeamRef = { id: string; name: string; color: string; logo_url: string | null };

export type PersonResult = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  email_name: string | null;
  is_self: boolean;
  is_teammate: boolean;
  /** Teams the SEARCHER is master of that this person already belongs to. */
  member_of: string[];
  /** …and ones they have a live pending invite to. */
  invited_to: string[];
};

export type ProjectResult = {
  id: string;
  title: string;
  stage: PipelineStage;
  expected_date: string | null;
  matched_title: string | null;
  thumbnail_path: string | null;
  team: SearchTeamRef;
};

export type TeamResult = SearchTeamRef & { is_master: boolean; member_count: number };

export type SearchResponse = {
  people: PersonResult[];
  projects: ProjectResult[];
  teams: TeamResult[];
  master_teams: SearchTeamRef[];
};

export const EMPTY_RESPONSE: SearchResponse = { people: [], projects: [], teams: [], master_teams: [] };

/** What's remembered in "Recent" — enough to render the row without a query. */
export type RecentItem = {
  kind: "person" | "project" | "team";
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  imageUrl?: string | null;
  color?: string;
  square?: boolean;
};
