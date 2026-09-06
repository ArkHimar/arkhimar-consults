begin;

create extension if not exists pgcrypto;

create type public.workspace_role as enum ('owner','admin','project_manager','member','viewer');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  code text not null check (char_length(code) between 1 and 24),
  title text not null check (char_length(title) between 2 and 180),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data)='object'),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(id,workspace_id),
  unique(workspace_id,code)
);

create table public.project_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  storage_path text not null unique,
  filename text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(project_id,workspace_id) references public.projects(id,workspace_id) on delete cascade
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index projects_workspace_updated_idx on public.projects(workspace_id,updated_at desc);
create index project_documents_project_created_idx on public.project_documents(project_id,created_at desc);
create index audit_events_workspace_project_time_idx on public.audit_events(workspace_id,project_id,occurred_at desc);
create index workspace_members_user_idx on public.workspace_members(user_id,workspace_id);

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.workspace_members m where m.workspace_id=target_workspace and m.user_id=auth.uid())
$$;

create or replace function public.workspace_role_for(target_workspace uuid)
returns public.workspace_role language sql stable security definer set search_path=public as $$
  select m.role from public.workspace_members m where m.workspace_id=target_workspace and m.user_id=auth.uid()
$$;

create or replace function public.can_manage_workspace(target_workspace uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(public.workspace_role_for(target_workspace) in ('owner','admin','project_manager'),false)
$$;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.workspace_role_for(uuid) from public;
revoke all on function public.can_manage_workspace(uuid) from public;
grant execute on function public.is_workspace_member(uuid), public.workspace_role_for(uuid), public.can_manage_workspace(uuid) to authenticated;

create or replace function public.bootstrap_workspace(workspace_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid; base_slug text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.workspace_members where user_id=auth.uid()) then raise exception 'User already belongs to a workspace'; end if;
  if char_length(trim(workspace_name)) not between 2 and 120 then raise exception 'Workspace name must be 2–120 characters'; end if;
  base_slug := trim(both '-' from regexp_replace(lower(trim(workspace_name)),'[^a-z0-9]+','-','g'));
  insert into public.workspaces(name,slug,created_by) values(trim(workspace_name),base_slug||'-'||substr(gen_random_uuid()::text,1,8),auth.uid()) returning id into new_id;
  insert into public.workspace_members(workspace_id,user_id,role) values(new_id,auth.uid(),'owner');
  return new_id;
end $$;
revoke all on function public.bootstrap_workspace(text) from public;
grant execute on function public.bootstrap_workspace(text) to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'display_name','')) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.audit_project_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare row_value public.projects; event_action text;
begin
  row_value := case when tg_op='DELETE' then old else new end;
  event_action := lower(tg_op);
  insert into public.audit_events(workspace_id,project_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(row_value.workspace_id,case when tg_op='DELETE' then null else row_value.id end,auth.uid(),event_action,'project',row_value.id::text,jsonb_build_object('version',row_value.version,'code',row_value.code));
  return row_value;
end $$;
create trigger audit_projects after insert or update or delete on public.projects for each row execute procedure public.audit_project_change();

create or replace function public.audit_document_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare row_value public.project_documents;
begin
  row_value := case when tg_op='DELETE' then old else new end;
  insert into public.audit_events(workspace_id,project_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(row_value.workspace_id,row_value.project_id,auth.uid(),lower(tg_op),'project_document',row_value.id::text,jsonb_build_object('filename',row_value.filename,'size_bytes',row_value.size_bytes));
  return row_value;
end $$;
create trigger audit_project_documents after insert or delete on public.project_documents for each row execute procedure public.audit_document_change();

create or replace function public.prepare_project_update()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.workspace_id<>old.workspace_id or new.created_by<>old.created_by or new.id<>old.id then raise exception 'Project identity fields are immutable'; end if;
  new.version := old.version+1;
  new.updated_at := now();
  return new;
end $$;
create trigger prepare_projects before update on public.projects for each row execute procedure public.prepare_project_update();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_documents enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_same_workspace_read on public.profiles for select to authenticated using (
  id=auth.uid() or exists(select 1 from public.workspace_members mine join public.workspace_members theirs on theirs.workspace_id=mine.workspace_id where mine.user_id=auth.uid() and theirs.user_id=profiles.id)
);
create policy profiles_self_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy workspaces_member_read on public.workspaces for select to authenticated using(public.is_workspace_member(id));
create policy workspaces_admin_update on public.workspaces for update to authenticated using(public.workspace_role_for(id) in ('owner','admin')) with check(public.workspace_role_for(id) in ('owner','admin'));
create policy members_workspace_read on public.workspace_members for select to authenticated using(public.is_workspace_member(workspace_id));
create policy members_admin_insert on public.workspace_members for insert to authenticated with check(public.workspace_role_for(workspace_id) in ('owner','admin'));
create policy members_admin_update on public.workspace_members for update to authenticated using(public.workspace_role_for(workspace_id) in ('owner','admin')) with check(public.workspace_role_for(workspace_id) in ('owner','admin'));
create policy members_admin_delete on public.workspace_members for delete to authenticated using(public.workspace_role_for(workspace_id) in ('owner','admin') and user_id<>auth.uid());
create policy projects_member_read on public.projects for select to authenticated using(public.is_workspace_member(workspace_id));
create policy projects_manager_insert on public.projects for insert to authenticated with check(public.workspace_role_for(workspace_id) in ('owner','admin','project_manager') and created_by=auth.uid());
create policy projects_manager_update on public.projects for update to authenticated using(public.can_manage_workspace(workspace_id)) with check(public.can_manage_workspace(workspace_id));
create policy projects_admin_delete on public.projects for delete to authenticated using(public.workspace_role_for(workspace_id) in ('owner','admin'));
create policy documents_member_read on public.project_documents for select to authenticated using(public.is_workspace_member(workspace_id));
create policy documents_contributor_insert on public.project_documents for insert to authenticated with check(public.workspace_role_for(workspace_id) in ('owner','admin','project_manager','member') and uploaded_by=auth.uid());
create policy documents_manager_delete on public.project_documents for delete to authenticated using(public.can_manage_workspace(workspace_id) or uploaded_by=auth.uid());
create policy audit_member_read on public.audit_events for select to authenticated using(public.is_workspace_member(workspace_id));

revoke insert,update,delete on public.audit_events from authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('project-documents','project-documents',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy project_files_member_read on storage.objects for select to authenticated using (
  bucket_id='project-documents' and exists(select 1 from public.workspace_members m where m.workspace_id::text=(storage.foldername(name))[1] and m.user_id=auth.uid())
);
create policy project_files_contributor_insert on storage.objects for insert to authenticated with check (
  bucket_id='project-documents' and exists(select 1 from public.workspace_members m join public.projects p on p.workspace_id=m.workspace_id where m.workspace_id::text=(storage.foldername(name))[1] and p.id::text=(storage.foldername(name))[2] and m.user_id=auth.uid() and m.role in ('owner','admin','project_manager','member')) and owner_id=auth.uid()::text
);
create policy project_files_manager_delete on storage.objects for delete to authenticated using (
  bucket_id='project-documents' and exists(select 1 from public.workspace_members m where m.workspace_id::text=(storage.foldername(name))[1] and m.user_id=auth.uid() and (m.role in ('owner','admin','project_manager') or owner_id=auth.uid()::text))
);

commit;
