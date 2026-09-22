-- ============================================================================
-- 0002: profile emails + thumbnail storage
-- ============================================================================

-- Store email on profiles so we always have something real to display
-- (full_name is often blank for accounts created directly in the
-- Supabase dashboard, since there's no signup form setting it yet).
alter table profiles add column if not exists email text;
update profiles set email = (select email from auth.users where auth.users.id = profiles.id)
  where email is null;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Thumbnail storage — a public-read bucket (thumbnails aren't sensitive,
-- and public read means they display instantly without signed URLs),
-- but uploads/deletes are still gated by the same stage-access rule as
-- everything else: only people who can act on Ideate (or the master)
-- can add or remove a project's thumbnails.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('thumbnails', 'thumbnails', true)
on conflict (id) do nothing;

-- Files are stored as "<project_id>/<filename>" — the folder name IS
-- the project id, which is how these policies find the right team.
create policy "ideate-access can upload thumbnails"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'thumbnails'
    and (
      member_has_stage_access(team_id_for_project((storage.foldername(name))[1]::uuid), 'ideate')
      or is_team_master(team_id_for_project((storage.foldername(name))[1]::uuid))
    )
  );

create policy "ideate-access can delete thumbnails"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'thumbnails'
    and (
      member_has_stage_access(team_id_for_project((storage.foldername(name))[1]::uuid), 'ideate')
      or is_team_master(team_id_for_project((storage.foldername(name))[1]::uuid))
    )
  );
