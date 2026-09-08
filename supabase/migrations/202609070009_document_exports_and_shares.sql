begin;

create table public.controlled_document_shares (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  document_id uuid not null,
  version integer not null check(version>0),
  token_hash text not null unique check(char_length(token_hash)=64),
  format text not null check(format in ('docx','pdf')),
  expires_at timestamptz not null,
  max_downloads integer not null default 10 check(max_downloads between 1 and 100),
  download_count integer not null default 0 check(download_count>=0),
  last_downloaded_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(document_id,workspace_id) references public.controlled_documents(id,workspace_id) on delete cascade,
  foreign key(project_id,workspace_id) references public.projects(id,workspace_id) on delete cascade,
  foreign key(document_id,version) references public.controlled_document_versions(document_id,version) on delete cascade
);

create index controlled_document_shares_document_idx on public.controlled_document_shares(document_id,created_at desc);
create index controlled_document_shares_active_idx on public.controlled_document_shares(token_hash) where revoked_at is null;

alter table public.controlled_document_shares enable row level security;
create policy controlled_document_shares_manager_read on public.controlled_document_shares for select to authenticated using(public.workspace_role_for(workspace_id) in ('owner','admin','project_manager'));
revoke insert,update,delete on public.controlled_document_shares from authenticated;
grant select on table public.controlled_document_shares to authenticated;
grant select on table public.controlled_documents,public.controlled_document_versions,public.controlled_document_shares to service_role;
grant insert,update on table public.controlled_document_shares to service_role;
grant insert on table public.audit_events to service_role;

commit;
