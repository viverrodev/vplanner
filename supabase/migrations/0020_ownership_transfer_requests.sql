-- ============================================================================
-- 0020: ownership transfer as a request/accept flow
--
-- Was previously an immediate, unilateral transfer. Now mirrors team
-- invites exactly: the current owner sends a request, the target gets
-- a real notification with Accept/Decline, and ownership only actually
-- moves once they say yes. Reuses invite_status (pending/accepted/
-- declined/expired) since the shape is identical.
-- ============================================================================

create table ownership_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  from_user_id uuid not null references profiles(id),
  to_user_id uuid not null references profiles(id),
  status invite_status not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  responded_at timestamptz
);

-- Only one live transfer request per team at a time, regardless of target.
create unique index ownership_transfer_requests_one_pending
  on ownership_transfer_requests (team_id)
  where status = 'pending';

alter table ownership_transfer_requests enable row level security;

create policy "sender and recipient can see the request"
  on ownership_transfer_requests for select to authenticated
  using (from_user_id = auth.uid() or to_user_id = auth.uid());

create policy "current owner can request a transfer"
  on ownership_transfer_requests for insert to authenticated
  with check (
    from_user_id = auth.uid()
    and exists (select 1 from teams where id = team_id and owner_id = auth.uid())
  );

create policy "recipient can respond to their own request"
  on ownership_transfer_requests for update to authenticated
  using (to_user_id = auth.uid())
  with check (to_user_id = auth.uid());

alter table notifications add column if not exists ownership_transfer_id uuid references ownership_transfer_requests(id) on delete cascade;

alter publication supabase_realtime add table ownership_transfer_requests;
