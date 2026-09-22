-- ============================================================================
-- 0006: workspace settings foundation
--  - teams get a logo
--  - notifications can point at a specific stage (for exact deep-linking,
--    including from @mentions)
--  - connected_accounts is a data-model placeholder for YouTube/TikTok/Meta
--    (no real OAuth wired up yet — that needs platform developer apps
--    first, see chat)
--  - when someone accepts a team invite, their new auth account is
--    automatically linked to the pending team_members row that was
--    waiting for them
-- ============================================================================

alter table teams add column if not exists logo_url text;
alter table notifications add column if not exists stage pipeline_stage;

create table if not exists connected_accounts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'tiktok', 'meta')),
  status text not null default 'not_connected',
  account_label text,
  created_at timestamptz not null default now(),
  unique (team_id, platform)
);

alter table connected_accounts enable row level security;

create policy "connected accounts readable by teammates"
  on connected_accounts for select to authenticated
  using (is_team_member(team_id));

create policy "master manages connected accounts"
  on connected_accounts for all to authenticated
  using (is_team_master(team_id))
  with check (is_team_master(team_id));

-- Workspace logo storage
insert into storage.buckets (id, name, public)
values ('team-logos', 'team-logos', true)
on conflict (id) do nothing;

create policy "master can upload team logo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'team-logos'
    and is_team_master((storage.foldername(name))[1]::uuid)
  );

create policy "master can delete team logo"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'team-logos'
    and is_team_master((storage.foldername(name))[1]::uuid)
  );

-- Auto-link: when an invited person actually creates their account
-- (accepting the email invite), attach it to whatever pending
-- team_members row was waiting for their email address.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email);

  update public.team_members
  set user_id = new.id, status = 'active'
  where invited_email = new.email and status = 'invited';

  return new;
end;
$$;
