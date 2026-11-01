begin;

create table if not exists public.workspace_role_permissions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  role public.workspace_role not null,
  can_view boolean not null default true,
  can_create boolean not null default false,
  can_edit boolean not null default true,
  can_approve boolean not null default false,
  can_delete boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(workspace_id,role)
);

create table if not exists public.workspace_member_permissions (
  workspace_id uuid not null,
  user_id uuid not null,
  can_view boolean,
  can_create boolean,
  can_edit boolean,
  can_approve boolean,
  can_delete boolean,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(workspace_id,user_id),
  foreign key(workspace_id,user_id) references public.workspace_members(workspace_id,user_id) on delete cascade
);

alter table public.workspace_role_permissions enable row level security;
alter table public.workspace_member_permissions enable row level security;

create or replace function public.workspace_has_permission(target_workspace uuid,requested_permission text,target_user uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path=public as $$
declare member_role public.workspace_role; role_value boolean; member_value boolean;
begin
  if requested_permission not in ('view','create','edit','approve','delete') then return false; end if;
  select role into member_role from public.workspace_members where workspace_id=target_workspace and user_id=target_user;
  if member_role is null then return false; end if;
  if member_role='owner' then return true; end if;
  select case requested_permission when 'view' then can_view when 'create' then can_create when 'edit' then can_edit when 'approve' then can_approve when 'delete' then can_delete end
    into member_value from public.workspace_member_permissions where workspace_id=target_workspace and user_id=target_user;
  if member_value is not null then return member_value; end if;
  select case requested_permission when 'view' then can_view when 'create' then can_create when 'edit' then can_edit when 'approve' then can_approve when 'delete' then can_delete end
    into role_value from public.workspace_role_permissions where workspace_id=target_workspace and role=member_role;
  if role_value is not null then return role_value; end if;
  return case requested_permission
    when 'view' then true
    when 'edit' then true
    when 'create' then member_role in ('admin','project_manager')
    when 'approve' then member_role='admin'
    when 'delete' then member_role='admin'
    else false end;
end $$;

create or replace function public.get_my_workspace_permissions(target_workspace uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'view',public.workspace_has_permission(target_workspace,'view'),
    'create',public.workspace_has_permission(target_workspace,'create'),
    'edit',public.workspace_has_permission(target_workspace,'edit'),
    'approve',public.workspace_has_permission(target_workspace,'approve'),
    'delete',public.workspace_has_permission(target_workspace,'delete')
  )
$$;

create or replace function public.get_workspace_permission_matrix(target_workspace uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if public.workspace_role_for(target_workspace) not in ('owner','admin') then raise exception 'Workspace admin permission required'; end if;
  return jsonb_build_object(
    'roles',coalesce((select jsonb_agg(jsonb_build_object('role',role::text,'view',can_view,'create',can_create,'edit',can_edit,'approve',can_approve,'delete',can_delete) order by role::text) from public.workspace_role_permissions where workspace_id=target_workspace),'[]'::jsonb),
    'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',user_id,'view',can_view,'create',can_create,'edit',can_edit,'approve',can_approve,'delete',can_delete)) from public.workspace_member_permissions where workspace_id=target_workspace),'[]'::jsonb)
  );
end $$;

create or replace function public.set_workspace_role_permissions(target_workspace uuid,target_role public.workspace_role,permission_values jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if public.workspace_role_for(target_workspace) not in ('owner','admin') then raise exception 'Workspace admin permission required'; end if;
  if target_role='owner' then raise exception 'Owner permissions are protected'; end if;
  insert into public.workspace_role_permissions(workspace_id,role,can_view,can_create,can_edit,can_approve,can_delete,updated_by)
  values(target_workspace,target_role,coalesce((permission_values->>'view')::boolean,true),coalesce((permission_values->>'create')::boolean,false),coalesce((permission_values->>'edit')::boolean,true),coalesce((permission_values->>'approve')::boolean,false),coalesce((permission_values->>'delete')::boolean,false),auth.uid())
  on conflict(workspace_id,role) do update set can_view=excluded.can_view,can_create=excluded.can_create,can_edit=excluded.can_edit,can_approve=excluded.can_approve,can_delete=excluded.can_delete,updated_by=auth.uid(),updated_at=now();
  return public.get_workspace_permission_matrix(target_workspace);
end $$;

create or replace function public.set_workspace_member_permissions(target_workspace uuid,target_user uuid,permission_values jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare target_member_role public.workspace_role;
begin
  if public.workspace_role_for(target_workspace) not in ('owner','admin') then raise exception 'Workspace admin permission required'; end if;
  select role into target_member_role from public.workspace_members where workspace_id=target_workspace and user_id=target_user;
  if target_member_role is null then raise exception 'Workspace member not found'; end if;
  if target_member_role='owner' then raise exception 'Owner permissions are protected'; end if;
  insert into public.workspace_member_permissions(workspace_id,user_id,can_view,can_create,can_edit,can_approve,can_delete,updated_by)
  values(target_workspace,target_user,(permission_values->>'view')::boolean,(permission_values->>'create')::boolean,(permission_values->>'edit')::boolean,(permission_values->>'approve')::boolean,(permission_values->>'delete')::boolean,auth.uid())
  on conflict(workspace_id,user_id) do update set can_view=excluded.can_view,can_create=excluded.can_create,can_edit=excluded.can_edit,can_approve=excluded.can_approve,can_delete=excluded.can_delete,updated_by=auth.uid(),updated_at=now();
  return public.get_workspace_permission_matrix(target_workspace);
end $$;

revoke all on function public.workspace_has_permission(uuid,text,uuid),public.get_my_workspace_permissions(uuid),public.get_workspace_permission_matrix(uuid),public.set_workspace_role_permissions(uuid,public.workspace_role,jsonb),public.set_workspace_member_permissions(uuid,uuid,jsonb) from public;
grant execute on function public.workspace_has_permission(uuid,text,uuid),public.get_my_workspace_permissions(uuid),public.get_workspace_permission_matrix(uuid),public.set_workspace_role_permissions(uuid,public.workspace_role,jsonb),public.set_workspace_member_permissions(uuid,uuid,jsonb) to authenticated;

drop policy if exists projects_manager_insert on public.projects;
drop policy if exists projects_manager_update on public.projects;
drop policy if exists projects_admin_delete on public.projects;
drop policy if exists projects_member_read on public.projects;
create policy projects_permission_read on public.projects for select to authenticated using(public.workspace_has_permission(workspace_id,'view'));
create policy projects_permission_insert on public.projects for insert to authenticated with check(public.workspace_has_permission(workspace_id,'create') and created_by=auth.uid());
create policy projects_permission_update on public.projects for update to authenticated using(public.workspace_has_permission(workspace_id,'edit')) with check(public.workspace_has_permission(workspace_id,'edit'));
create policy projects_permission_delete on public.projects for delete to authenticated using(public.workspace_has_permission(workspace_id,'delete'));

drop policy if exists documents_contributor_insert on public.project_documents;
drop policy if exists documents_manager_delete on public.project_documents;
drop policy if exists documents_member_read on public.project_documents;
create policy documents_permission_read on public.project_documents for select to authenticated using(public.workspace_has_permission(workspace_id,'view'));
create policy documents_permission_insert on public.project_documents for insert to authenticated with check((public.workspace_has_permission(workspace_id,'create') or public.workspace_has_permission(workspace_id,'edit')) and uploaded_by=auth.uid());
create policy documents_permission_delete on public.project_documents for delete to authenticated using(public.workspace_has_permission(workspace_id,'delete') or uploaded_by=auth.uid());

drop policy if exists project_files_contributor_insert on storage.objects;
drop policy if exists project_files_manager_delete on storage.objects;
drop policy if exists project_files_member_read on storage.objects;
create policy project_files_permission_read on storage.objects for select to authenticated using (
  bucket_id='project-documents' and public.workspace_has_permission(((storage.foldername(name))[1])::uuid,'view')
);
create policy project_files_permission_insert on storage.objects for insert to authenticated with check (
  bucket_id='project-documents' and public.workspace_has_permission(((storage.foldername(name))[1])::uuid,'edit') and owner_id=auth.uid()::text
);
create policy project_files_permission_delete on storage.objects for delete to authenticated using (
  bucket_id='project-documents' and (public.workspace_has_permission(((storage.foldername(name))[1])::uuid,'delete') or owner_id=auth.uid()::text)
);

-- Existing governed RPCs retain their validation, versioning and immutable-record
-- behavior. This inserts the effective permission decision immediately after each
-- function resolves the caller's workspace role.
do $$
declare proc record; definition text; rewritten text;
begin
  for proc in
    select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array[
      'save_business_case','transition_business_case','save_project_charter','transition_project_charter',
      'save_core_planning','approve_scope_baseline','begin_scope_revision','save_schedule_control','save_cost_control',
      'approve_delivery_baseline','begin_delivery_revision','save_project_controls','transition_change_request',
      'save_execution_control','transition_governance_review','publish_status_report'
    ])
  loop
    definition:=pg_get_functiondef(proc.oid);
    rewritten:=regexp_replace(definition,
      'actor_role[[:space:]]*:=[[:space:]]*public\.workspace_role_for\(([^;]+)\);',
      E'actor_role := public.workspace_role_for(\\1);\n  if public.workspace_has_permission(\\1,''approve'') then actor_role := ''admin''; elsif public.workspace_has_permission(\\1,''edit'') then actor_role := ''project_manager''; end if;',
      'g');
    if rewritten=definition then raise exception 'Permission upgrade could not patch function %',proc.proname; end if;
    execute rewritten;
  end loop;
end $$;

create or replace function public.transition_controlled_document(target_document uuid,next_status text)
returns void language plpgsql security definer set search_path=public as $$
declare record public.controlled_documents;
begin
  select * into record from public.controlled_documents where id=target_document for update;
  if record.id is null then raise exception 'Document not found'; end if;
  if next_status='in_review' and record.status='draft' and public.workspace_has_permission(record.workspace_id,'edit') then
    update public.controlled_document_versions set status='in_review' where document_id=record.id and version=record.current_version;
  elsif next_status='draft' and record.status='in_review' and public.workspace_has_permission(record.workspace_id,'edit') then
    update public.controlled_document_versions set status='draft' where document_id=record.id and version=record.current_version;
  elsif next_status='approved' and record.status='in_review' and public.workspace_has_permission(record.workspace_id,'approve') then
    update public.controlled_document_versions set status='approved',approved_by=auth.uid(),approved_at=now() where document_id=record.id and version=record.current_version;
  elsif next_status='archived' and record.status='approved' and public.workspace_has_permission(record.workspace_id,'delete') then
    null;
  else raise exception 'This document transition is not permitted';
  end if;
  update public.controlled_documents set status=next_status,updated_by=auth.uid(),updated_at=now(),effective_date=case when next_status='approved' then current_date else effective_date end where id=record.id;
  insert into public.audit_events(workspace_id,project_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(record.workspace_id,record.project_id,auth.uid(),next_status,'controlled_document',record.id::text,jsonb_build_object('version',record.current_version));
end $$;

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
  if not (public.workspace_has_permission(target_workspace,'create') or public.workspace_has_permission(target_workspace,'edit')) then raise exception 'Create or Edit / Update permission required'; end if;
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

drop policy if exists controlled_documents_member_read on public.controlled_documents;
create policy controlled_documents_permission_read on public.controlled_documents for select to authenticated using(public.workspace_has_permission(workspace_id,'view'));
drop policy if exists controlled_versions_member_read on public.controlled_document_versions;
create policy controlled_versions_permission_read on public.controlled_document_versions for select to authenticated using(public.workspace_has_permission(workspace_id,'view'));

-- The controlled-document creation and revision functions do not declare an
-- actor_role variable, so these focused replacements use the same permission helper.
create or replace function public.create_controlled_document(target_project uuid,document_id_code text,document_type text,document_title text,document_owner text,document_confidentiality text,document_tags text[],document_content jsonb,revision_note text default '')
returns uuid language plpgsql security definer set search_path=public as $$
declare target_workspace uuid; created_id uuid;
begin
  select workspace_id into target_workspace from public.projects where id=target_project;
  if target_workspace is null or not public.workspace_has_permission(target_workspace,'create') then raise exception 'Create permission required'; end if;
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
  if record.id is null or not public.workspace_has_permission(record.workspace_id,'edit') then raise exception 'Edit / Update permission required'; end if;
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

grant select on public.workspace_role_permissions,public.workspace_member_permissions to authenticated;

commit;
