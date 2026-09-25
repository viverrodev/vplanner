-- ============================================================================
-- 0034: scripts
--
-- One script per short (and, next, per long video). Stored as the
-- editor's JSON document, plus a plain-text copy for counting words and
-- (next) search.
--
--   * Read: everyone on the team.
--   * Write: masters and scripters, at any stage.
--   * Saves are conflict-safe: the app sends the version it last saw; if
--     someone else saved in between, nothing is overwritten.
--   * Images live in the public "script-images" bucket under
--     <team id>/<script id>/…, with random file names. Only masters and
--     scripters of that team can upload or delete.
--
-- Staging first, then production.
-- ============================================================================

create or replace function can_edit_script(p_team uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select is_team_master(p_team) or has_team_role(p_team, 'scripter');
$$;

create table if not exists scripts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  short_video_id uuid unique references short_videos(id) on delete cascade,
  long_video_id uuid unique references long_video_projects(id) on delete cascade,
  content jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  content_text text not null default '',
  word_count int not null default 0 check (word_count >= 0),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null,
  check (num_nonnulls(short_video_id, long_video_id) = 1),
  check (octet_length(content::text) <= 2000000)
);

create index if not exists scripts_team_idx on scripts (team_id);
create index if not exists scripts_updated_by_idx on scripts (updated_by);
create index if not exists scripts_text_trgm_idx on scripts using gin (lower(content_text) extensions.gin_trgm_ops);

-- The team always comes from the video (never trusted from the app);
-- versions only ever go up by one; owner and team never change.
create or replace function scripts_before_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.team_id := coalesce(
      (select team_id from short_videos where id = new.short_video_id),
      (select team_id from long_video_projects where id = new.long_video_id)
    );
    if new.team_id is null then
      raise exception 'That video doesn''t exist.' using errcode = '23514';
    end if;
    new.version := 1;
    new.created_at := now();
  else
    if new.team_id is distinct from old.team_id
       or new.short_video_id is distinct from old.short_video_id
       or new.long_video_id is distinct from old.long_video_id then
      raise exception 'That can''t be changed.' using errcode = '42501';
    end if;
    new.version := old.version + 1;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists scripts_before_write on scripts;
create trigger scripts_before_write
  before insert or update on scripts
  for each row execute procedure scripts_before_write();

alter table scripts enable row level security;

drop policy if exists "scripts readable by teammates" on scripts;
create policy "scripts readable by teammates"
  on scripts for select to authenticated
  using (team_id in (select my_team_ids()));

-- The team is filled in by the trigger (BEFORE triggers run before these
-- checks), so a script can only be created for your own team's video.
drop policy if exists "masters and scripters create scripts" on scripts;
create policy "masters and scripters create scripts"
  on scripts for insert to authenticated
  with check (can_edit_script(team_id));

drop policy if exists "masters and scripters edit scripts" on scripts;
create policy "masters and scripters edit scripts"
  on scripts for update to authenticated
  using (can_edit_script(team_id))
  with check (can_edit_script(team_id));

drop policy if exists "masters delete scripts" on scripts;
create policy "masters delete scripts"
  on scripts for delete to authenticated
  using (is_team_master(team_id));

-- Images --------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('script-images', 'script-images', true)
on conflict (id) do nothing;

drop policy if exists "script editors upload script images" on storage.objects;
create policy "script editors upload script images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'script-images'
    and can_edit_script(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "script editors delete script images" on storage.objects;
create policy "script editors delete script images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'script-images'
    and can_edit_script(((storage.foldername(name))[1])::uuid)
  );
