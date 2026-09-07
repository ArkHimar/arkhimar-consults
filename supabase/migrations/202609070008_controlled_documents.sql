begin;

create table public.controlled_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  document_code text not null check (document_code ~ '^[A-Z0-9][A-Z0-9._-]{1,39}$'),
  artifact_type text not null check (char_length(artifact_type) between 2 and 100),
  title text not null check (char_length(title) between 2 and 180),
  owner_name text not null default '',
  status text not null default 'draft' check (status in ('draft','in_review','approved','archived')),
  current_version integer not null default 1 check (current_version>0),
  confidentiality text not null default 'Internal' check (confidentiality in ('Public','Internal','Confidential','Restricted')),
  reviewers jsonb not null default '[]'::jsonb check (jsonb_typeof(reviewers)='array'),
  approvers jsonb not null default '[]'::jsonb check (jsonb_typeof(approvers)='array'),
  related_artifacts jsonb not null default '[]'::jsonb check (jsonb_typeof(related_artifacts)='array'),
  tags text[] not null default '{}',
  effective_date date,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,workspace_id),
  unique(workspace_id,document_code),
  foreign key(project_id,workspace_id) references public.projects(id,workspace_id) on delete cascade
);

create table public.controlled_document_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  document_id uuid not null,
  version integer not null check (version>0),
  status text not null default 'draft' check (status in ('draft','in_review','approved','superseded')),
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content)='object'),
  revision_notes text not null default '',
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(document_id,version),
  foreign key(document_id,workspace_id) references public.controlled_documents(id,workspace_id) on delete cascade,
  foreign key(project_id,workspace_id) references public.projects(id,workspace_id) on delete cascade
);

create index controlled_documents_project_idx on public.controlled_documents(project_id,updated_at desc);
create index controlled_document_versions_document_idx on public.controlled_document_versions(document_id,version desc);

create or replace function public.protect_approved_document_version()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and old.status in ('approved','superseded') then
    raise exception 'Approved document versions are immutable';
  end if;
  if tg_op='UPDATE' and old.status='superseded' then
    raise exception 'Approved document versions are immutable';
  end if;
  if tg_op='UPDATE' and old.status='approved' then
    if new.status='superseded' and (to_jsonb(new)-'status')=(to_jsonb(old)-'status') then
      return new;
    end if;
    raise exception 'Approved document versions are immutable';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger protect_controlled_versions before update or delete on public.controlled_document_versions for each row execute procedure public.protect_approved_document_version();

create or replace function public.create_controlled_document(target_project uuid,document_id_code text,document_type text,document_title text,document_owner text,document_confidentiality text,document_tags text[],document_content jsonb,revision_note text default '')
returns uuid language plpgsql security definer set search_path=public as $$
declare target_workspace uuid; created_id uuid;
begin
  select workspace_id into target_workspace from public.projects where id=target_project;
  if target_workspace is null or public.workspace_role_for(target_workspace) not in ('owner','admin','project_manager') then raise exception 'Project manager permission required'; end if;
  insert into public.controlled_documents(workspace_id,project_id,document_code,artifact_type,title,owner_name,confidentiality,tags,created_by,updated_by)
  values(target_workspace,target_project,upper(trim(document_id_code)),trim(document_type),trim(document_title),trim(document_owner),document_confidentiality,coalesce(document_tags,'{}'),auth.uid(),auth.uid()) returning id into created_id;
  insert into public.controlled_document_versions(workspace_id,project_id,document_id,version,content,revision_notes,created_by)
  values(target_workspace,target_project,created_id,1,coalesce(document_content,'{}'::jsonb),coalesce(revision_note,''),auth.uid());
  insert into public.audit_events(workspace_id,project_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(target_workspace,target_project,auth.uid(),'created','controlled_document',created_id::text,jsonb_build_object('document_code',upper(trim(document_id_code)),'version',1));
  return created_id;
end $$;

create or replace function public.revise_controlled_document(target_document uuid,document_content jsonb,revision_note text)
returns integer language plpgsql security definer set search_path=public as $$
declare record public.controlled_documents; next_version integer;
begin
  select * into record from public.controlled_documents where id=target_document for update;
  if record.id is null or public.workspace_role_for(record.workspace_id) not in ('owner','admin','project_manager') then raise exception 'Project manager permission required'; end if;
  if record.status<>'approved' then raise exception 'Only approved documents can begin a new revision'; end if;
  update public.controlled_document_versions set status='superseded' where document_id=record.id and version=record.current_version and status='approved';
  next_version:=record.current_version+1;
  insert into public.controlled_document_versions(workspace_id,project_id,document_id,version,content,revision_notes,created_by)
  values(record.workspace_id,record.project_id,record.id,next_version,coalesce(document_content,'{}'::jsonb),coalesce(revision_note,''),auth.uid());
  update public.controlled_documents set status='draft',current_version=next_version,updated_by=auth.uid(),updated_at=now(),effective_date=null where id=record.id;
  insert into public.audit_events(workspace_id,project_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(record.workspace_id,record.project_id,auth.uid(),'revised','controlled_document',record.id::text,jsonb_build_object('version',next_version));
  return next_version;
end $$;

create or replace function public.transition_controlled_document(target_document uuid,next_status text)
returns void language plpgsql security definer set search_path=public as $$
declare record public.controlled_documents; actor_role public.workspace_role;
begin
  select * into record from public.controlled_documents where id=target_document for update;
  actor_role:=public.workspace_role_for(record.workspace_id);
  if record.id is null then raise exception 'Document not found'; end if;
  if next_status='in_review' and record.status='draft' and actor_role in ('owner','admin','project_manager') then
    update public.controlled_document_versions set status='in_review' where document_id=record.id and version=record.current_version;
  elsif next_status='draft' and record.status='in_review' and actor_role in ('owner','admin','project_manager') then
    update public.controlled_document_versions set status='draft' where document_id=record.id and version=record.current_version;
  elsif next_status='approved' and record.status='in_review' and actor_role in ('owner','admin') then
    update public.controlled_document_versions set status='approved',approved_by=auth.uid(),approved_at=now() where document_id=record.id and version=record.current_version;
  elsif next_status='archived' and record.status='approved' and actor_role in ('owner','admin') then
    null;
  else raise exception 'This document transition is not permitted';
  end if;
  update public.controlled_documents set status=next_status,updated_by=auth.uid(),updated_at=now(),effective_date=case when next_status='approved' then current_date else effective_date end where id=record.id;
  insert into public.audit_events(workspace_id,project_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(record.workspace_id,record.project_id,auth.uid(),next_status,'controlled_document',record.id::text,jsonb_build_object('version',record.current_version));
end $$;

alter table public.controlled_documents enable row level security;
alter table public.controlled_document_versions enable row level security;
create policy controlled_documents_member_read on public.controlled_documents for select to authenticated using(public.is_workspace_member(workspace_id));
create policy controlled_versions_member_read on public.controlled_document_versions for select to authenticated using(public.is_workspace_member(workspace_id));
grant select on table public.controlled_documents,public.controlled_document_versions to authenticated;
revoke insert,update,delete on public.controlled_documents,public.controlled_document_versions from authenticated;
revoke all on function public.create_controlled_document(uuid,text,text,text,text,text,text[],jsonb,text),public.revise_controlled_document(uuid,jsonb,text),public.transition_controlled_document(uuid,text) from public;
grant execute on function public.create_controlled_document(uuid,text,text,text,text,text,text[],jsonb,text),public.revise_controlled_document(uuid,jsonb,text),public.transition_controlled_document(uuid,text) to authenticated;

commit;
