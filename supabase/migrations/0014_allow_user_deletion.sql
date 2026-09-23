-- ============================================================================
-- 0014: allow deleting a user account
--
-- Several tables record "who did this" (who commented, who created a
-- project, who sent an invite) with a foreign key that had no ON DELETE
-- behavior specified — Postgres's safe default is to block the delete
-- entirely rather than leave a dangling reference, which is exactly the
-- "error deleting user" bug. The content itself should survive a user
-- being removed; only the authorship link should clear to null.
--
-- Deliberately NOT changed: teams.owner_id. A team must always have a
-- real owner — that one should keep blocking deletion until the team's
-- ownership is actually resolved (transferred or the team deleted).
-- ============================================================================

alter table long_video_projects alter column created_by drop not null;
alter table long_video_projects drop constraint long_video_projects_created_by_fkey;
alter table long_video_projects add constraint long_video_projects_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

alter table project_comments alter column author_id drop not null;
alter table project_comments drop constraint project_comments_author_id_fkey;
alter table project_comments add constraint project_comments_author_id_fkey
  foreign key (author_id) references profiles(id) on delete set null;

alter table video_review_pins alter column author_id drop not null;
alter table video_review_pins drop constraint video_review_pins_author_id_fkey;
alter table video_review_pins add constraint video_review_pins_author_id_fkey
  foreign key (author_id) references profiles(id) on delete set null;

alter table team_invites alter column invited_by drop not null;
alter table team_invites drop constraint team_invites_invited_by_fkey;
alter table team_invites add constraint team_invites_invited_by_fkey
  foreign key (invited_by) references profiles(id) on delete set null;
