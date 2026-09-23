-- ============================================================================
-- 0011: user profile settings — username + avatar storage
-- ============================================================================

alter table profiles add column if not exists username text;

-- Case-insensitive uniqueness, but only enforced once someone actually
-- sets one — existing accounts without a username yet aren't blocked.
create unique index if not exists profiles_username_unique
  on profiles (lower(username))
  where username is not null;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Files are stored as "<user_id>/avatar-...", so a person can only ever
-- touch their own folder.
create policy "users can upload their own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users can replace their own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users can delete their own avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
