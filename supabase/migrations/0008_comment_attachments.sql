-- ============================================================================
-- 0008: comment attachments (images shown inline, other files as downloads)
-- ============================================================================

create table comment_attachments (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references project_comments(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_size bigint not null,
  mime_type text not null,
  created_at timestamptz not null default now()
);

alter table comment_attachments enable row level security;

create policy "attachments readable by teammates"
  on comment_attachments for select to authenticated
  using (
    exists (
      select 1 from project_comments pc
      where pc.id = comment_id
        and is_team_member(team_id_for_project(pc.project_id))
    )
  );

create policy "comment author can add attachments"
  on comment_attachments for insert to authenticated
  with check (
    exists (
      select 1 from project_comments pc
      where pc.id = comment_id and pc.author_id = auth.uid()
    )
  );

-- Public-read bucket, same tradeoff as thumbnails: convenient direct URLs,
-- not meant for sensitive files. Files are stored as
-- "<project_id>/<random>-<filename>" so upload access can be checked by
-- team membership from the path alone.
insert into storage.buckets (id, name, public)
values ('comment-attachments', 'comment-attachments', true)
on conflict (id) do nothing;

create policy "team members can upload comment attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'comment-attachments'
    and is_team_member(team_id_for_project((storage.foldername(name))[1]::uuid))
  );
