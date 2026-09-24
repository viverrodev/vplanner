-- ============================================================================
-- 0024: global search
--
-- One function, global_search(q), answers the whole search bar in a single
-- round trip: people, video projects and teams.
--
-- SECURITY: the function is SECURITY INVOKER — it runs as the person
-- searching, so every Row Level Security rule still applies. You can only
-- ever find projects and teams you could already open; there's no
-- separate permission logic here to get wrong. (Profiles are readable by
-- any signed-in user, same as before — that's what makes "find a person
-- to invite" possible.) Emails are never returned, and only match when
-- the query itself contains an "@".
--
-- SPEED: pg_trgm ("trigram") indexes make both substring matches
-- ("iphone" inside "Fake iPhone Test") and typo-tolerant matches
-- ("iphnoe") fast, instead of scanning every row.
-- ============================================================================

create extension if not exists pg_trgm with schema extensions;

-- Trigram indexes on exactly the expressions the function searches.
create index if not exists profiles_username_trgm_idx
  on profiles using gin (lower(username) extensions.gin_trgm_ops);
create index if not exists profiles_full_name_trgm_idx
  on profiles using gin (lower(full_name) extensions.gin_trgm_ops);
create index if not exists projects_title_trgm_idx
  on long_video_projects using gin (lower(title) extensions.gin_trgm_ops);
create index if not exists project_titles_title_trgm_idx
  on project_titles using gin (lower(title) extensions.gin_trgm_ops);
create index if not exists teams_name_trgm_idx
  on teams using gin (lower(name) extensions.gin_trgm_ops);

-- Escape LIKE wildcards so a search for "50%" means the text "50%".
create or replace function search_escape_like(s text)
returns text
language sql
immutable
as $$
  select replace(replace(replace(s, '\', '\\'), '%', '\%'), '_', '\_');
$$;

create or replace function global_search(q text, max_results int default 6)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, extensions
-- How fuzzy "typo-tolerant" matching is (0–1, higher = stricter).
set pg_trgm.word_similarity_threshold = 0.45
as $$
declare
  term text := left(lower(trim(coalesce(q, ''))), 64);
  lim int := least(greatest(coalesce(max_results, 6), 1), 20);
  esc text;
  contains_pat text;
  prefix_pat text;
  people jsonb := '[]'::jsonb;
  projects jsonb := '[]'::jsonb;
  teams_found jsonb := '[]'::jsonb;
  master_teams jsonb;
begin
  -- Teams the searcher can invite people into (for "Invite to…").
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'name', t.name, 'color', t.color, 'logo_url', t.logo_url
         ) order by t.name), '[]'::jsonb)
    into master_teams
    from teams t
   where t.id in (select my_master_team_ids());

  if length(term) < 2 then
    return jsonb_build_object('people', people, 'projects', projects,
                              'teams', teams_found, 'master_teams', master_teams);
  end if;

  esc := search_escape_like(term);
  contains_pat := '%' || esc || '%';
  prefix_pat := esc || '%';

  -- PEOPLE -------------------------------------------------------------
  select coalesce(jsonb_agg(to_jsonb(x) - 'score' - 'sort_name' order by x.score desc, x.sort_name), '[]'::jsonb)
    into people
    from (
      select
        pr.id,
        pr.username,
        pr.full_name,
        pr.avatar_url,
        -- Only as a last-resort display name (no username AND no name).
        case when pr.username is null and pr.full_name is null
             then split_part(pr.email, '@', 1) end as email_name,
        coalesce(pr.username, pr.full_name, split_part(pr.email, '@', 1)) as sort_name,
        (pr.id = auth.uid()) as is_self,
        exists (
          select 1 from team_members tm
          where tm.user_id = pr.id and tm.status = 'active'
            and tm.team_id in (select my_team_ids())
        ) as is_teammate,
        coalesce((
          select jsonb_agg(tm.team_id) from team_members tm
          where tm.user_id = pr.id and tm.team_id in (select my_master_team_ids())
        ), '[]'::jsonb) as member_of,
        coalesce((
          select jsonb_agg(ti.team_id) from team_invites ti
          where ti.invited_user_id = pr.id and ti.status = 'pending'
            and ti.expires_at > now()
            and ti.team_id in (select my_master_team_ids())
        ), '[]'::jsonb) as invited_to,
        (case
           when lower(pr.username) = term or lower(pr.full_name) = term then 3
           when lower(pr.username) like prefix_pat or lower(pr.full_name) like prefix_pat then 2
           else 0
         end
         + greatest(
             word_similarity(term, lower(coalesce(pr.username, ''))),
             word_similarity(term, lower(coalesce(pr.full_name, '')))
           )) as score
      from profiles pr
      where lower(pr.username) like contains_pat
         or lower(pr.full_name) like contains_pat
         or term <% lower(coalesce(pr.username, ''))
         or term <% lower(coalesce(pr.full_name, ''))
         or (position('@' in term) > 0 and lower(pr.email) like prefix_pat)
      order by score desc
      limit lim
    ) x;

  -- PROJECTS (RLS: only projects in your teams) ------------------------
  select coalesce(jsonb_agg(to_jsonb(x) - 'score' - 'updated_at' order by x.score desc, x.updated_at desc), '[]'::jsonb)
    into projects
    from (
      select
        p.id,
        p.title,
        p.stage,
        p.expected_date,
        p.updated_at,
        alt.title as matched_title,
        th.storage_path as thumbnail_path,
        jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'logo_url', t.logo_url) as team,
        (case
           when lower(p.title) = term then 3
           when lower(p.title) like prefix_pat then 2
           when lower(p.title) like contains_pat then 1
           when alt.title is not null then 0.8
           else 0
         end
         + word_similarity(term, lower(p.title))) as score
      from long_video_projects p
      join teams t on t.id = p.team_id
      left join lateral (
        select pt.title from project_titles pt
        where pt.project_id = p.id
          and lower(pt.title) like contains_pat
          and lower(pt.title) <> lower(p.title)
        order by pt.position
        limit 1
      ) alt on true
      left join lateral (
        select th.storage_path from project_thumbnails th
        where th.project_id = p.id
        order by th.position
        limit 1
      ) th on true
      where lower(p.title) like contains_pat
         or term <% lower(p.title)
         or alt.title is not null
      order by score desc, p.updated_at desc
      limit lim
    ) x;

  -- TEAMS (RLS: only teams you're in) ----------------------------------
  select coalesce(jsonb_agg(to_jsonb(x) - 'score' order by x.score desc, x.name), '[]'::jsonb)
    into teams_found
    from (
      select
        t.id, t.name, t.color, t.logo_url,
        (t.id in (select my_master_team_ids())) as is_master,
        (select count(*) from team_members tm where tm.team_id = t.id and tm.status = 'active') as member_count,
        (case
           when lower(t.name) = term then 3
           when lower(t.name) like prefix_pat then 2
           else 0
         end + word_similarity(term, lower(t.name))) as score
      from teams t
      where lower(t.name) like contains_pat or term <% lower(t.name)
      order by score desc
      limit lim
    ) x;

  return jsonb_build_object('people', people, 'projects', projects,
                            'teams', teams_found, 'master_teams', master_teams);
end;
$$;

revoke all on function global_search(text, int) from public, anon;
grant execute on function global_search(text, int) to authenticated;
