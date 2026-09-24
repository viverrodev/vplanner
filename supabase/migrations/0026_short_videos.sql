-- ============================================================================
-- 0026: short videos module
--
--   1. Removes connected social accounts (posting stays manual).
--   2. Team-wide ENTRY NUMBERS (#1, #2, …) for long videos and shorts,
--      allocated by the database so two people creating at the same
--      moment can never get the same number.
--   3. The shorts tables:
--        short_videos       — one row per short
--        short_video_posts  — one row per platform it's been posted on
--        short_video_events — tamper-proof activity history (written only
--                             by triggers, never by the app directly)
--   4. Who can do what, enforced HERE (RLS + a guard trigger), with the
--      app mirroring it for what buttons to show:
--        Master     — everything
--        Scripter   — create shorts; edit title/date/platforms/caption
--                     while the short is in Script
--        Its editor — mark editing done (Editing → In review); set the
--                     final-file link
--        Scheduler  — (role id 'publisher') mark platforms posted, post
--                     links, caption and file link
--        Everyone on the team can see everything.
--   5. notifications.short_id so notifications open the right short.
--   6. global_search() learns shorts and "#12"-style number lookups.
--
-- Staging first, then production.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. CONNECTED ACCOUNTS — removed
-- ---------------------------------------------------------------------------

drop table if exists connected_accounts cascade;


-- ---------------------------------------------------------------------------
-- 2. ENTRY NUMBERS
-- ---------------------------------------------------------------------------

create table if not exists team_counters (
  team_id uuid not null references teams(id) on delete cascade,
  kind text not null,
  value int not null default 0,
  primary key (team_id, kind)
);
alter table team_counters enable row level security;
revoke all on team_counters from anon, authenticated;
-- (No policies on purpose: only the functions below touch it.)

-- Atomically hands out the next number. The row lock taken by the
-- upsert makes concurrent callers queue up instead of colliding.
create or replace function next_team_number(p_team uuid, p_kind text)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v int;
begin
  insert into team_counters (team_id, kind, value)
  values (p_team, p_kind, 1)
  on conflict (team_id, kind) do update set value = team_counters.value + 1
  returning value into v;
  return v;
end;
$$;
revoke all on function next_team_number(uuid, text) from public, anon, authenticated;

-- Long videos: number every existing project in creation order.
alter table long_video_projects add column if not exists entry_number int;

with numbered as (
  select id, row_number() over (partition by team_id order by created_at, id) as rn
  from long_video_projects
)
update long_video_projects p
   set entry_number = n.rn
  from numbered n
 where n.id = p.id and p.entry_number is null;

insert into team_counters (team_id, kind, value)
select team_id, 'long_video', max(entry_number)
  from long_video_projects
 group by team_id
on conflict (team_id, kind) do update
  set value = greatest(team_counters.value, excluded.value);

alter table long_video_projects alter column entry_number set not null;
alter table long_video_projects drop constraint if exists long_video_projects_team_entry_number_key;
alter table long_video_projects add constraint long_video_projects_team_entry_number_key
  unique (team_id, entry_number);

create or replace function assign_long_video_number()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.entry_number := next_team_number(new.team_id, 'long_video');
  return new;
end;
$$;

drop trigger if exists assign_long_video_number on long_video_projects;
create trigger assign_long_video_number
  before insert on long_video_projects
  for each row execute procedure assign_long_video_number();

-- Numbers are permanent: extend the 0022 project guard to protect them.
create or replace function guard_project_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.team_id is distinct from old.team_id then
    raise exception 'A project can''t be moved to another team.' using errcode = '42501';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'A project''s creator can''t be changed.' using errcode = '42501';
  end if;
  if new.entry_number is distinct from old.entry_number then
    raise exception 'Entry numbers can''t be changed.' using errcode = '42501';
  end if;
  if new.stage is distinct from old.stage and not is_team_master(old.team_id) then
    raise exception 'Only the master can change a project''s stage.' using errcode = '42501';
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3. SHORTS — types & tables
-- ---------------------------------------------------------------------------

do $$ begin
  create type short_stage as enum ('script', 'editing', 'review', 'ready', 'posted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type social_platform as enum ('youtube', 'instagram', 'facebook', 'tiktok');
exception when duplicate_object then null; end $$;

create table if not exists short_videos (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  entry_number int not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  stage short_stage not null default 'script',
  planned_date date,
  editor_member_id uuid references team_members(id) on delete set null,
  platforms social_platform[] not null
    default '{youtube,instagram,facebook,tiktok}'
    check (cardinality(platforms) between 1 and 4),
  file_link text check (file_link is null or char_length(file_link) <= 2000),
  caption text check (caption is null or char_length(caption) <= 5000),
  review_note text check (review_note is null or char_length(review_note) <= 2000),
  created_by uuid references profiles(id) on delete set null,
  updated_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, entry_number)
);

create table if not exists short_video_posts (
  short_id uuid not null references short_videos(id) on delete cascade,
  platform social_platform not null,
  post_url text check (post_url is null or (char_length(post_url) <= 2000 and post_url ~* '^https?://')),
  posted_at timestamptz not null default now(),
  posted_by uuid references profiles(id) on delete set null,
  primary key (short_id, platform)
);

create table if not exists short_video_events (
  id bigint generated always as identity primary key,
  short_id uuid not null references short_videos(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  kind text not null,          -- created | stage | editor | posted | unposted
  from_stage short_stage,
  to_stage short_stage,
  platform social_platform,
  note text,
  created_at timestamptz not null default now()
);

-- Indexes: list page (by number / date / stage), editor's own work,
-- history, and every foreign key.
create index if not exists short_videos_team_number_idx on short_videos (team_id, entry_number desc);
create index if not exists short_videos_team_stage_idx on short_videos (team_id, stage);
create index if not exists short_videos_team_date_idx on short_videos (team_id, planned_date) where planned_date is not null;
create index if not exists short_videos_editor_idx on short_videos (editor_member_id);
create index if not exists short_videos_created_by_idx on short_videos (created_by);
create index if not exists short_videos_updated_by_idx on short_videos (updated_by);
create index if not exists short_videos_title_trgm_idx on short_videos using gin (lower(title) extensions.gin_trgm_ops);
create index if not exists short_video_posts_posted_by_idx on short_video_posts (posted_by);
create index if not exists short_video_events_short_idx on short_video_events (short_id, created_at);
create index if not exists short_video_events_actor_idx on short_video_events (actor_id);


-- ---------------------------------------------------------------------------
-- 4. PERMISSION HELPERS (set-based, same pattern as 0023)
-- ---------------------------------------------------------------------------

create or replace function my_short_ids()
returns setof uuid
language sql
stable
security definer set search_path = public
as $$
  select s.id from short_videos s
  where s.team_id in (
    select team_id from team_members where user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function has_team_role(p_team uuid, p_role role_type)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from team_members tm
    join member_roles mr on mr.team_member_id = tm.id
    where tm.team_id = p_team and tm.user_id = auth.uid()
      and tm.status = 'active' and mr.role = p_role
  );
$$;

-- Master or Scheduler of the short's team.
create or replace function can_post_short(p_short uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from short_videos s
    where s.id = p_short
      and (is_team_master(s.team_id) or has_team_role(s.team_id, 'publisher'))
  );
$$;


-- ---------------------------------------------------------------------------
-- 5. TRIGGERS
-- ---------------------------------------------------------------------------

-- Number + defaults on create.
create or replace function short_before_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.entry_number := next_team_number(new.team_id, 'short_video');
  new.title := btrim(new.title);
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists short_before_insert on short_videos;
create trigger short_before_insert
  before insert on short_videos
  for each row execute procedure short_before_insert();

-- The editor must be an active member of the SAME team (checked for
-- everyone, masters included).
create or replace function short_check_editor()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.editor_member_id is not null and not exists (
    select 1 from team_members
    where id = new.editor_member_id and team_id = new.team_id and status = 'active'
  ) then
    raise exception 'The editor must be an active member of this team.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists short_check_editor on short_videos;
create trigger short_check_editor
  before insert or update of editor_member_id on short_videos
  for each row execute procedure short_check_editor();

-- Field-level permissions for everyone who isn't a Master.
create or replace function short_guard_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_master boolean;
  v_scripter boolean;
  v_scheduler boolean;
  v_editor boolean;
  v_in_script boolean := old.stage = 'script';
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;

  -- Internal recalculations (posted status) and server/admin writes.
  if auth.uid() is null or current_setting('vp.short_system', true) = 'on' then
    return new;
  end if;

  if new.team_id is distinct from old.team_id
     or new.entry_number is distinct from old.entry_number
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'That can''t be changed.' using errcode = '42501';
  end if;

  v_master := is_team_master(old.team_id);
  if v_master then
    return new;
  end if;

  v_scripter := has_team_role(old.team_id, 'scripter');
  v_scheduler := has_team_role(old.team_id, 'publisher');
  v_editor := exists (
    select 1 from team_members
    where id = old.editor_member_id and user_id = auth.uid() and status = 'active'
  );

  if new.stage is distinct from old.stage
     and not (v_editor and old.stage = 'editing' and new.stage = 'review') then
    raise exception 'Only the master can move this short to that stage.' using errcode = '42501';
  end if;

  if new.editor_member_id is distinct from old.editor_member_id
     or new.review_note is distinct from old.review_note then
    raise exception 'Only the master can do that.' using errcode = '42501';
  end if;

  if (new.title is distinct from old.title
      or new.planned_date is distinct from old.planned_date
      or new.platforms is distinct from old.platforms)
     and not (v_scripter and v_in_script) then
    raise exception 'Only the master (or a scripter, while it''s in Script) can change that.' using errcode = '42501';
  end if;

  if new.caption is distinct from old.caption
     and not (v_scheduler or (v_scripter and v_in_script)) then
    raise exception 'Only the master, a scheduler or the scripter can edit the caption.' using errcode = '42501';
  end if;

  if new.file_link is distinct from old.file_link
     and not (v_editor or v_scheduler) then
    raise exception 'Only the master, its editor or a scheduler can set the file link.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists short_guard_update on short_videos;
create trigger short_guard_update
  before update on short_videos
  for each row execute procedure short_guard_update();

-- Posted status follows the per-platform posts: all chosen platforms
-- posted → 'posted'; one removed again → back to 'ready'.
create or replace function short_recompute_posted(p_short uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  s short_videos;
  v_done int;
begin
  select * into s from short_videos where id = p_short;
  if not found then return; end if;

  select count(*) into v_done
  from short_video_posts
  where short_id = p_short and platform = any(s.platforms);

  perform set_config('vp.short_system', 'on', true);
  if s.stage = 'ready' and v_done >= cardinality(s.platforms) then
    update short_videos set stage = 'posted' where id = p_short;
  elsif s.stage = 'posted' and v_done < cardinality(s.platforms) then
    update short_videos set stage = 'ready' where id = p_short;
  end if;
  perform set_config('vp.short_system', 'off', true);
end;
$$;
revoke all on function short_recompute_posted(uuid) from public, anon, authenticated;

-- History: stage moves and editor changes.
create or replace function short_log_changes()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into short_video_events (short_id, actor_id, kind, to_stage)
    values (new.id, auth.uid(), 'created', new.stage);
    if new.editor_member_id is not null then
      insert into short_video_events (short_id, actor_id, kind)
      values (new.id, auth.uid(), 'editor');
    end if;
    return new;
  end if;

  if new.stage is distinct from old.stage then
    insert into short_video_events (short_id, actor_id, kind, from_stage, to_stage, note)
    values (
      new.id, auth.uid(), 'stage', old.stage, new.stage,
      -- Sent back from review → keep the master's note with the event.
      case when old.stage = 'review' and new.stage = 'editing' then new.review_note end
    );
  end if;

  if new.editor_member_id is distinct from old.editor_member_id then
    insert into short_video_events (short_id, actor_id, kind)
    values (new.id, auth.uid(), 'editor');
  end if;

  -- Platforms changed → posted status may have changed too.
  if new.platforms is distinct from old.platforms then
    perform short_recompute_posted(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists short_log_changes on short_videos;
create trigger short_log_changes
  after insert or update on short_videos
  for each row execute procedure short_log_changes();

create or replace function short_post_changed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_short uuid := coalesce(new.short_id, old.short_id);
begin
  if tg_op = 'INSERT' then
    insert into short_video_events (short_id, actor_id, kind, platform)
    values (new.short_id, auth.uid(), 'posted', new.platform);
  elsif tg_op = 'DELETE' then
    insert into short_video_events (short_id, actor_id, kind, platform)
    select old.short_id, auth.uid(), 'unposted', old.platform
    where exists (select 1 from short_videos where id = old.short_id); -- not during a cascade delete
  end if;
  perform short_recompute_posted(v_short);
  return coalesce(new, old);
end;
$$;

drop trigger if exists short_post_changed on short_video_posts;
create trigger short_post_changed
  after insert or delete on short_video_posts
  for each row execute procedure short_post_changed();

-- Posting is only possible once a short is approved, and only for the
-- platforms it's meant for. The poster is always the signed-in user.
create or replace function short_post_before_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  s short_videos;
begin
  select * into s from short_videos where id = new.short_id;
  if tg_op = 'INSERT' then
    if s.stage not in ('ready', 'posted') then
      raise exception 'A short can only be marked posted after it''s approved.' using errcode = '23514';
    end if;
    if not (new.platform = any(s.platforms)) then
      raise exception 'This short isn''t planned for that platform.' using errcode = '23514';
    end if;
    new.posted_at := now();
    new.posted_by := auth.uid();
  else
    -- Only the link may change afterwards.
    new.short_id := old.short_id;
    new.platform := old.platform;
    new.posted_at := old.posted_at;
    new.posted_by := old.posted_by;
  end if;
  return new;
end;
$$;

drop trigger if exists short_post_before_write on short_video_posts;
create trigger short_post_before_write
  before insert or update on short_video_posts
  for each row execute procedure short_post_before_write();


-- ---------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

alter table short_videos enable row level security;
alter table short_video_posts enable row level security;
alter table short_video_events enable row level security;

drop policy if exists "shorts readable by teammates" on short_videos;
create policy "shorts readable by teammates"
  on short_videos for select to authenticated
  using (team_id in (select my_team_ids()));

drop policy if exists "masters and scripters create shorts" on short_videos;
create policy "masters and scripters create shorts"
  on short_videos for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and stage = 'script'
    and team_id in (select my_team_ids())
    and (is_team_master(team_id) or has_team_role(team_id, 'scripter'))
  );

-- Teammates may attempt updates; short_guard_update decides field by field.
drop policy if exists "teammates update shorts" on short_videos;
create policy "teammates update shorts"
  on short_videos for update to authenticated
  using (team_id in (select my_team_ids()))
  with check (team_id in (select my_team_ids()));

drop policy if exists "masters delete shorts" on short_videos;
create policy "masters delete shorts"
  on short_videos for delete to authenticated
  using (is_team_master(team_id));

drop policy if exists "posts readable by teammates" on short_video_posts;
create policy "posts readable by teammates"
  on short_video_posts for select to authenticated
  using (short_id in (select my_short_ids()));

drop policy if exists "schedulers mark posted" on short_video_posts;
create policy "schedulers mark posted"
  on short_video_posts for insert to authenticated
  with check (can_post_short(short_id));

drop policy if exists "schedulers edit post links" on short_video_posts;
create policy "schedulers edit post links"
  on short_video_posts for update to authenticated
  using (can_post_short(short_id))
  with check (can_post_short(short_id));

drop policy if exists "schedulers unmark posted" on short_video_posts;
create policy "schedulers unmark posted"
  on short_video_posts for delete to authenticated
  using (can_post_short(short_id));

drop policy if exists "history readable by teammates" on short_video_events;
create policy "history readable by teammates"
  on short_video_events for select to authenticated
  using (short_id in (select my_short_ids()));

-- History is written only by the triggers above.
revoke insert, update, delete on short_video_events from anon, authenticated;


-- ---------------------------------------------------------------------------
-- 7. NOTIFICATIONS can point at a short
-- ---------------------------------------------------------------------------

alter table notifications add column if not exists short_id uuid references short_videos(id) on delete cascade;
create index if not exists notifications_short_idx on notifications (short_id);


-- ---------------------------------------------------------------------------
-- 8. SEARCH — shorts + "#12" number lookups
-- ---------------------------------------------------------------------------

create or replace function global_search(q text, max_results int default 6)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, extensions
set pg_trgm.word_similarity_threshold = 0.45
as $$
declare
  term text := left(lower(trim(coalesce(q, ''))), 64);
  lim int := least(greatest(coalesce(max_results, 6), 1), 20);
  esc text;
  contains_pat text;
  prefix_pat text;
  num int;
  people jsonb := '[]'::jsonb;
  projects jsonb := '[]'::jsonb;
  shorts jsonb := '[]'::jsonb;
  teams_found jsonb := '[]'::jsonb;
  master_teams jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'name', t.name, 'color', t.color, 'logo_url', t.logo_url
         ) order by t.name), '[]'::jsonb)
    into master_teams
    from teams t
   where t.id in (select my_master_team_ids());

  -- "#12" or "12" → entry number lookup (shorts + long videos).
  if term ~ '^#?[0-9]{1,7}$' then
    num := ltrim(term, '#')::int;
  end if;

  if length(term) < 2 and num is null then
    return jsonb_build_object('people', people, 'projects', projects, 'shorts', shorts,
                              'teams', teams_found, 'master_teams', master_teams);
  end if;

  esc := search_escape_like(ltrim(term, '#'));
  contains_pat := '%' || esc || '%';
  prefix_pat := esc || '%';

  -- PEOPLE (skipped for pure number lookups)
  if num is null then
    select coalesce(jsonb_agg(to_jsonb(x) - 'score' - 'sort_name' order by x.score desc, x.sort_name), '[]'::jsonb)
      into people
      from (
        select
          pr.id, pr.username, pr.full_name, pr.avatar_url,
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
  end if;

  -- LONG VIDEOS (RLS: your teams only)
  select coalesce(jsonb_agg(to_jsonb(x) - 'score' - 'updated_at' order by x.score desc, x.updated_at desc), '[]'::jsonb)
    into projects
    from (
      select
        p.id, p.entry_number, p.title, p.stage, p.expected_date, p.updated_at,
        alt.title as matched_title,
        th.storage_path as thumbnail_path,
        jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'logo_url', t.logo_url) as team,
        (case
           when num is not null and p.entry_number = num then 4
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
      where (num is not null and p.entry_number = num)
         or lower(p.title) like contains_pat
         or term <% lower(p.title)
         or alt.title is not null
      order by score desc, p.updated_at desc
      limit lim
    ) x;

  -- SHORTS (RLS: your teams only)
  select coalesce(jsonb_agg(to_jsonb(x) - 'score' order by x.score desc, x.entry_number desc), '[]'::jsonb)
    into shorts
    from (
      select
        s.id, s.entry_number, s.title, s.stage, s.planned_date,
        (select count(*) from short_video_posts sp
          where sp.short_id = s.id and sp.platform = any(s.platforms)) as posted_count,
        cardinality(s.platforms) as platform_count,
        jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'logo_url', t.logo_url) as team,
        (case
           when num is not null and s.entry_number = num then 4
           when lower(s.title) = term then 3
           when lower(s.title) like prefix_pat then 2
           when lower(s.title) like contains_pat then 1
           else 0
         end
         + word_similarity(term, lower(s.title))) as score
      from short_videos s
      join teams t on t.id = s.team_id
      where (num is not null and s.entry_number = num)
         or lower(s.title) like contains_pat
         or term <% lower(s.title)
      order by score desc
      limit lim
    ) x;

  -- TEAMS (skipped for pure number lookups)
  if num is null then
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
  end if;

  return jsonb_build_object('people', people, 'projects', projects, 'shorts', shorts,
                            'teams', teams_found, 'master_teams', master_teams);
end;
$$;

revoke all on function global_search(text, int) from public, anon;
grant execute on function global_search(text, int) to authenticated;


-- ---------------------------------------------------------------------------
-- 9. REALTIME — list and detail pages update live
-- ---------------------------------------------------------------------------

do $$ begin
  alter publication supabase_realtime add table short_videos;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table short_video_posts;
exception when duplicate_object then null; end $$;
