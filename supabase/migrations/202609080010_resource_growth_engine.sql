begin;

create table public.resource_leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  resource_slug text not null check(resource_slug ~ '^[a-z0-9-]{3,80}$'),
  resource_version integer not null check(resource_version>0),
  submitter_name text not null check(char_length(submitter_name) between 2 and 160),
  submitter_email text not null check(char_length(submitter_email) between 3 and 254),
  project_type text check(project_type is null or char_length(project_type)<=80),
  project_location text check(project_location is null or char_length(project_location)<=160),
  timeframe text check(timeframe is null or char_length(timeframe)<=80),
  budget_range text check(budget_range is null or char_length(budget_range)<=80),
  marketing_consent boolean not null default false,
  attribution jsonb not null default '{}'::jsonb check(jsonb_typeof(attribution)='object'),
  ip_hash text not null check(char_length(ip_hash)=64),
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create index resource_leads_workspace_created_idx on public.resource_leads(workspace_id,created_at desc);
create index resource_leads_rate_limit_idx on public.resource_leads(ip_hash,created_at desc);

create table public.resource_import_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  document_id uuid not null,
  resource_slug text not null check(resource_slug ~ '^[a-z0-9-]{3,80}$'),
  resource_version integer not null check(resource_version>0),
  imported_by uuid not null references auth.users(id),
  imported_at timestamptz not null default now(),
  foreign key(project_id,workspace_id) references public.projects(id,workspace_id) on delete cascade,
  foreign key(document_id,workspace_id) references public.controlled_documents(id,workspace_id) on delete cascade
);
create index resource_import_events_project_idx on public.resource_import_events(project_id,imported_at desc);

alter table public.resource_leads enable row level security;
alter table public.resource_import_events enable row level security;
create policy resource_leads_admin_read on public.resource_leads for select to authenticated using(public.workspace_role_for(workspace_id) in ('owner','admin'));
create policy resource_import_events_member_read on public.resource_import_events for select to authenticated using(public.is_workspace_member(workspace_id));
revoke insert,update,delete on public.resource_leads,public.resource_import_events from authenticated;
grant select on public.resource_leads,public.resource_import_events to authenticated;
grant select,insert on public.resource_leads,public.resource_import_events to service_role;

create or replace function public.import_resource_draft(target_project uuid,source_slug text,source_version integer)
returns uuid language plpgsql security definer set search_path=public as $$
declare target_workspace uuid; created_document uuid; code text; source_title text; source_summary text;
begin
  if source_version<>1 then raise exception 'Unsupported resource version'; end if;
  case source_slug
    when 'project-initiation-pack' then source_title:='Project Initiation Pack'; source_summary:='Draft initiation structure covering the project need, business case, option review, charter, stakeholders and readiness.';
    when 'built-environment-project-pack' then source_title:='Built-Environment Project Pack'; source_summary:='Draft built-environment control structure covering the client brief, deliverables, design decisions, RFIs, materials, site actions, change and handover.';
    else raise exception 'Resource is not available for import';
  end case;
  select workspace_id into target_workspace from public.projects where id=target_project for update;
  if target_workspace is null then raise exception 'Project not found'; end if;
  if public.workspace_role_for(target_workspace) not in ('owner','admin','project_manager') then raise exception 'Project manager permission required'; end if;
  code:='RES-'||upper(substr(replace(source_slug,'-',''),1,12))||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into public.controlled_documents(workspace_id,project_id,document_code,artifact_type,title,owner_name,confidentiality,tags,created_by,updated_by)
  values(target_workspace,target_project,code,'Resource Import',trim(source_title),'','Internal',array['resource-import',source_slug],auth.uid(),auth.uid()) returning id into created_document;
  insert into public.controlled_document_versions(workspace_id,project_id,document_id,version,status,content,revision_notes,created_by)
  values(target_workspace,target_project,created_document,1,'draft',jsonb_build_object('summary',coalesce(source_summary,''),'source_resource',jsonb_build_object('slug',source_slug,'version',source_version)),'Imported as draft from ArkHimar resource',auth.uid());
  insert into public.resource_import_events(workspace_id,project_id,document_id,resource_slug,resource_version,imported_by)
  values(target_workspace,target_project,created_document,source_slug,source_version,auth.uid());
  insert into public.audit_events(workspace_id,project_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(target_workspace,target_project,auth.uid(),'imported','controlled_document',created_document::text,jsonb_build_object('resource_slug',source_slug,'resource_version',source_version,'status','draft'));
  return created_document;
end $$;
revoke all on function public.import_resource_draft(uuid,text,integer) from public;
grant execute on function public.import_resource_draft(uuid,text,integer) to authenticated;

commit;
