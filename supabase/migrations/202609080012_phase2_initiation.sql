begin;

create table public.business_cases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  status text not null default 'draft' check (status in ('draft','in_review','changes_requested','approved','archived')),
  current_version integer not null default 1 check (current_version>0),
  owner_user_id uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id),
  unique(id,workspace_id),
  foreign key(project_id,workspace_id) references public.projects(id,workspace_id) on delete cascade
);

create table public.business_case_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  business_case_id uuid not null,
  version integer not null check (version>0),
  status text not null default 'draft' check (status in ('draft','in_review','changes_requested','approved','superseded')),
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content)='object'),
  created_by uuid not null references auth.users(id),
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_case_id,version),
  foreign key(business_case_id,workspace_id) references public.business_cases(id,workspace_id) on delete cascade,
  foreign key(project_id,workspace_id) references public.projects(id,workspace_id) on delete cascade
);

create table public.business_case_options (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  business_case_version_id uuid not null references public.business_case_versions(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 160),
  description text not null default '',
  benefits text not null default '',
  drawbacks text not null default '',
  risk_summary text not null default '',
  estimated_cost numeric(18,2) not null default 0 check (estimated_cost>=0),
  estimated_duration_months numeric(8,2) not null default 0 check (estimated_duration_months>=0),
  criteria_scores jsonb not null default '{}'::jsonb check (jsonb_typeof(criteria_scores)='object'),
  weighted_score numeric(8,4) not null default 0 check (weighted_score between 0 and 5),
  sort_order integer not null default 0 check (sort_order>=0),
  created_at timestamptz not null default now(),
  foreign key(project_id,workspace_id) references public.projects(id,workspace_id) on delete cascade
);

create table public.business_case_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  business_case_id uuid not null references public.business_cases(id) on delete cascade,
  version integer not null check (version>0),
  decision text not null check (decision in ('submitted','changes_requested','approved','revision_started')),
  comments text not null default '',
  decided_by uuid not null references auth.users(id),
  decided_at timestamptz not null default now(),
  foreign key(project_id,workspace_id) references public.projects(id,workspace_id) on delete cascade
);

create table public.project_charters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  status text not null default 'draft' check (status in ('draft','in_review','changes_requested','approved','archived')),
  current_version integer not null default 1 check (current_version>0),
  owner_user_id uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id),
  unique(id,workspace_id),
  foreign key(project_id,workspace_id) references public.projects(id,workspace_id) on delete cascade
);

create table public.project_charter_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  charter_id uuid not null,
  version integer not null check (version>0),
  status text not null default 'draft' check (status in ('draft','in_review','changes_requested','approved','superseded')),
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content)='object'),
  created_by uuid not null references auth.users(id),
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(charter_id,version),
  foreign key(charter_id,workspace_id) references public.project_charters(id,workspace_id) on delete cascade,
  foreign key(project_id,workspace_id) references public.projects(id,workspace_id) on delete cascade
);

create table public.project_charter_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  charter_id uuid not null references public.project_charters(id) on delete cascade,
  version integer not null check (version>0),
  decision text not null check (decision in ('submitted','changes_requested','approved','revision_started')),
  comments text not null default '',
  decided_by uuid not null references auth.users(id),
  decided_at timestamptz not null default now(),
  foreign key(project_id,workspace_id) references public.projects(id,workspace_id) on delete cascade
);

create index business_cases_workspace_status_idx on public.business_cases(workspace_id,status,updated_at desc);
create index business_case_versions_case_idx on public.business_case_versions(business_case_id,version desc);
create index business_case_options_version_idx on public.business_case_options(business_case_version_id,sort_order);
create index business_case_decisions_case_idx on public.business_case_decisions(business_case_id,decided_at desc);
create index project_charters_workspace_status_idx on public.project_charters(workspace_id,status,updated_at desc);
create index project_charter_versions_charter_idx on public.project_charter_versions(charter_id,version desc);
create index project_charter_decisions_charter_idx on public.project_charter_decisions(charter_id,decided_at desc);

create or replace function public.protect_approved_initiation_version()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and old.status in ('approved','superseded') then raise exception 'Approved initiation versions are immutable'; end if;
  if tg_op='UPDATE' and old.status='superseded' then raise exception 'Approved initiation versions are immutable'; end if;
  if tg_op='UPDATE' and old.status='approved' then
    if new.status='superseded' and (to_jsonb(new)-'status'-'updated_at')=(to_jsonb(old)-'status'-'updated_at') then return new; end if;
    raise exception 'Approved initiation versions are immutable';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger protect_business_case_versions before update or delete on public.business_case_versions for each row execute procedure public.protect_approved_initiation_version();
create trigger protect_project_charter_versions before update or delete on public.project_charter_versions for each row execute procedure public.protect_approved_initiation_version();

create or replace function public.initiation_weighted_score(scores jsonb)
returns numeric language sql immutable set search_path=public as $$
  select round((
    greatest(0,least(5,coalesce((scores->>'strategicFit')::numeric,0)))*30 +
    greatest(0,least(5,coalesce((scores->>'benefit')::numeric,0)))*25 +
    greatest(0,least(5,coalesce((scores->>'affordability')::numeric,0)))*20 +
    greatest(0,least(5,coalesce((scores->>'deliverability')::numeric,0)))*15 +
    greatest(0,least(5,coalesce((scores->>'risk')::numeric,0)))*10
  )/100,4)
$$;

create or replace function public.save_business_case(target_project uuid,expected_version integer,case_content jsonb,case_options jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare target_workspace uuid; actor_role public.workspace_role; artifact public.business_cases; artifact_version public.business_case_versions; option_record jsonb; option_scores jsonb;
begin
  if jsonb_typeof(coalesce(case_content,'{}'::jsonb))<>'object' or jsonb_typeof(coalesce(case_options,'[]'::jsonb))<>'array' then raise exception 'Invalid business case payload'; end if;
  select workspace_id into target_workspace from public.projects where id=target_project;
  actor_role:=public.workspace_role_for(target_workspace);
  if target_workspace is null or actor_role not in ('owner','admin','project_manager') then raise exception 'Project manager permission required'; end if;
  select * into artifact from public.business_cases where project_id=target_project for update;
  if artifact.id is null then
    if expected_version not in (0,1) then raise exception 'Business case version conflict'; end if;
    insert into public.business_cases(workspace_id,project_id,owner_user_id,created_by,updated_by) values(target_workspace,target_project,auth.uid(),auth.uid(),auth.uid()) returning * into artifact;
    insert into public.business_case_versions(workspace_id,project_id,business_case_id,version,content,created_by) values(target_workspace,target_project,artifact.id,1,case_content,auth.uid()) returning * into artifact_version;
  else
    if artifact.current_version<>expected_version then raise exception 'Business case version conflict'; end if;
    if artifact.status not in ('draft','changes_requested') then raise exception 'Only a draft business case can be edited'; end if;
    select * into artifact_version from public.business_case_versions where business_case_id=artifact.id and version=artifact.current_version for update;
    update public.business_case_versions set content=case_content,status='draft',updated_at=now() where id=artifact_version.id returning * into artifact_version;
    update public.business_cases set status='draft',updated_by=auth.uid(),updated_at=now() where id=artifact.id returning * into artifact;
    delete from public.business_case_options where business_case_version_id=artifact_version.id;
  end if;
  for option_record in select value from jsonb_array_elements(case_options) loop
    option_scores:=coalesce(option_record->'scores','{}'::jsonb);
    if char_length(trim(coalesce(option_record->>'title',''))) not between 2 and 160 then raise exception 'Every option requires a title'; end if;
    insert into public.business_case_options(workspace_id,project_id,business_case_version_id,title,description,benefits,drawbacks,risk_summary,estimated_cost,estimated_duration_months,criteria_scores,weighted_score,sort_order)
    values(target_workspace,target_project,artifact_version.id,trim(option_record->>'title'),coalesce(option_record->>'description',''),coalesce(option_record->>'benefits',''),coalesce(option_record->>'drawbacks',''),coalesce(option_record->>'riskSummary',''),greatest(0,coalesce((option_record->>'estimatedCost')::numeric,0)),greatest(0,coalesce((option_record->>'durationMonths')::numeric,0)),option_scores,public.initiation_weighted_score(option_scores),coalesce((option_record->>'sortOrder')::integer,0));
  end loop;
  insert into public.audit_events(workspace_id,project_id,actor_user_id,action,entity_type,entity_id,metadata) values(target_workspace,target_project,auth.uid(),'saved','business_case',artifact.id::text,jsonb_build_object('version',artifact.current_version,'option_count',jsonb_array_length(case_options)));
  return jsonb_build_object('id',artifact.id,'version',artifact.current_version,'status',artifact.status);
end $$;

create or replace function public.transition_business_case(target_project uuid,expected_version integer,next_status text,decision_comments text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare artifact public.business_cases; artifact_version public.business_case_versions; actor_role public.workspace_role; next_version integer; option_count integer;
begin
  select * into artifact from public.business_cases where project_id=target_project for update;
  if artifact.id is null or artifact.current_version<>expected_version then raise exception 'Business case version conflict'; end if;
  actor_role:=public.workspace_role_for(artifact.workspace_id);
  select * into artifact_version from public.business_case_versions where business_case_id=artifact.id and version=artifact.current_version for update;
  if next_status='in_review' and artifact.status in ('draft','changes_requested') and actor_role in ('owner','admin','project_manager') then
    if nullif(trim(artifact_version.content->>'executiveSummary'),'') is null then raise exception 'Executive summary is required'; end if;
    select count(*) into option_count from public.business_case_options where business_case_version_id=artifact_version.id;
    if option_count<2 then raise exception 'At least two options are required'; end if;
    update public.business_case_versions set status='in_review',submitted_by=auth.uid(),submitted_at=now(),updated_at=now() where id=artifact_version.id;
  elsif next_status='changes_requested' and artifact.status='in_review' and actor_role in ('owner','admin') then
    if nullif(trim(decision_comments),'') is null then raise exception 'Decision comments are required'; end if;
    update public.business_case_versions set status='changes_requested',updated_at=now() where id=artifact_version.id;
  elsif next_status='approved' and artifact.status='in_review' and actor_role in ('owner','admin') then
    update public.business_case_versions set status='approved',approved_by=auth.uid(),approved_at=now(),updated_at=now() where id=artifact_version.id;
  elsif next_status='draft' and artifact.status='approved' and actor_role in ('owner','admin','project_manager') then
    update public.business_case_versions set status='superseded',updated_at=now() where id=artifact_version.id;
    next_version:=artifact.current_version+1;
    insert into public.business_case_versions(workspace_id,project_id,business_case_id,version,status,content,created_by) values(artifact.workspace_id,artifact.project_id,artifact.id,next_version,'draft',artifact_version.content,auth.uid()) returning * into artifact_version;
    insert into public.business_case_options(workspace_id,project_id,business_case_version_id,title,description,benefits,drawbacks,risk_summary,estimated_cost,estimated_duration_months,criteria_scores,weighted_score,sort_order)
      select workspace_id,project_id,artifact_version.id,title,description,benefits,drawbacks,risk_summary,estimated_cost,estimated_duration_months,criteria_scores,weighted_score,sort_order from public.business_case_options where business_case_version_id=(select id from public.business_case_versions where business_case_id=artifact.id and version=expected_version);
    update public.business_cases set current_version=next_version where id=artifact.id;
  else raise exception 'This business case transition is not permitted'; end if;
  update public.business_cases set status=next_status,updated_by=auth.uid(),updated_at=now() where id=artifact.id returning * into artifact;
  insert into public.business_case_decisions(workspace_id,project_id,business_case_id,version,decision,comments,decided_by) values(artifact.workspace_id,artifact.project_id,artifact.id,artifact.current_version,case when next_status='in_review' then 'submitted' when next_status='draft' then 'revision_started' else next_status end,coalesce(decision_comments,''),auth.uid());
  insert into public.audit_events(workspace_id,project_id,actor_user_id,action,entity_type,entity_id,metadata) values(artifact.workspace_id,artifact.project_id,auth.uid(),next_status,'business_case',artifact.id::text,jsonb_build_object('version',artifact.current_version));
  return jsonb_build_object('id',artifact.id,'version',artifact.current_version,'status',artifact.status);
end $$;

create or replace function public.save_project_charter(target_project uuid,expected_version integer,charter_content jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare target_workspace uuid; actor_role public.workspace_role; artifact public.project_charters; artifact_version public.project_charter_versions;
begin
  if jsonb_typeof(coalesce(charter_content,'{}'::jsonb))<>'object' then raise exception 'Invalid charter payload'; end if;
  select workspace_id into target_workspace from public.projects where id=target_project;
  actor_role:=public.workspace_role_for(target_workspace);
  if target_workspace is null or actor_role not in ('owner','admin','project_manager') then raise exception 'Project manager permission required'; end if;
  select * into artifact from public.project_charters where project_id=target_project for update;
  if artifact.id is null then
    if expected_version not in (0,1) then raise exception 'Charter version conflict'; end if;
    insert into public.project_charters(workspace_id,project_id,owner_user_id,created_by,updated_by) values(target_workspace,target_project,auth.uid(),auth.uid(),auth.uid()) returning * into artifact;
    insert into public.project_charter_versions(workspace_id,project_id,charter_id,version,content,created_by) values(target_workspace,target_project,artifact.id,1,charter_content,auth.uid());
  else
    if artifact.current_version<>expected_version then raise exception 'Charter version conflict'; end if;
    if artifact.status not in ('draft','changes_requested') then raise exception 'Only a draft charter can be edited'; end if;
    update public.project_charter_versions set content=charter_content,status='draft',updated_at=now() where charter_id=artifact.id and version=artifact.current_version;
    update public.project_charters set status='draft',updated_by=auth.uid(),updated_at=now() where id=artifact.id returning * into artifact;
  end if;
  insert into public.audit_events(workspace_id,project_id,actor_user_id,action,entity_type,entity_id,metadata) values(target_workspace,target_project,auth.uid(),'saved','project_charter',artifact.id::text,jsonb_build_object('version',artifact.current_version));
  return jsonb_build_object('id',artifact.id,'version',artifact.current_version,'status',artifact.status);
end $$;

create or replace function public.transition_project_charter(target_project uuid,expected_version integer,next_status text,decision_comments text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare artifact public.project_charters; artifact_version public.project_charter_versions; actor_role public.workspace_role; next_version integer; updated_project_version integer;
begin
  select * into artifact from public.project_charters where project_id=target_project for update;
  if artifact.id is null or artifact.current_version<>expected_version then raise exception 'Charter version conflict'; end if;
  actor_role:=public.workspace_role_for(artifact.workspace_id);
  select * into artifact_version from public.project_charter_versions where charter_id=artifact.id and version=artifact.current_version for update;
  if next_status='in_review' and artifact.status in ('draft','changes_requested') and actor_role in ('owner','admin','project_manager') then
    if nullif(trim(artifact_version.content->>'purpose'),'') is null then raise exception 'Purpose and justification are required'; end if;
    update public.project_charter_versions set status='in_review',submitted_by=auth.uid(),submitted_at=now(),updated_at=now() where id=artifact_version.id;
  elsif next_status='changes_requested' and artifact.status='in_review' and actor_role in ('owner','admin') then
    if nullif(trim(decision_comments),'') is null then raise exception 'Decision comments are required'; end if;
    update public.project_charter_versions set status='changes_requested',updated_at=now() where id=artifact_version.id;
  elsif next_status='approved' and artifact.status='in_review' and actor_role in ('owner','admin') then
    update public.project_charter_versions set status='approved',approved_by=auth.uid(),approved_at=now(),updated_at=now() where id=artifact_version.id;
    update public.projects set data=jsonb_set(data,'{status}','"Authorized"'::jsonb,true) where id=artifact.project_id returning version into updated_project_version;
  elsif next_status='draft' and artifact.status='approved' and actor_role in ('owner','admin','project_manager') then
    update public.project_charter_versions set status='superseded',updated_at=now() where id=artifact_version.id;
    next_version:=artifact.current_version+1;
    insert into public.project_charter_versions(workspace_id,project_id,charter_id,version,status,content,created_by) values(artifact.workspace_id,artifact.project_id,artifact.id,next_version,'draft',artifact_version.content,auth.uid());
    update public.project_charters set current_version=next_version where id=artifact.id;
  else raise exception 'This charter transition is not permitted'; end if;
  update public.project_charters set status=next_status,updated_by=auth.uid(),updated_at=now() where id=artifact.id returning * into artifact;
  insert into public.project_charter_decisions(workspace_id,project_id,charter_id,version,decision,comments,decided_by) values(artifact.workspace_id,artifact.project_id,artifact.id,artifact.current_version,case when next_status='in_review' then 'submitted' when next_status='draft' then 'revision_started' else next_status end,coalesce(decision_comments,''),auth.uid());
  insert into public.audit_events(workspace_id,project_id,actor_user_id,action,entity_type,entity_id,metadata) values(artifact.workspace_id,artifact.project_id,auth.uid(),next_status,'project_charter',artifact.id::text,jsonb_build_object('version',artifact.current_version));
  if updated_project_version is null then select version into updated_project_version from public.projects where id=artifact.project_id; end if;
  return jsonb_build_object('id',artifact.id,'version',artifact.current_version,'status',artifact.status,'projectVersion',updated_project_version);
end $$;

alter table public.business_cases enable row level security;
alter table public.business_case_versions enable row level security;
alter table public.business_case_options enable row level security;
alter table public.business_case_decisions enable row level security;
alter table public.project_charters enable row level security;
alter table public.project_charter_versions enable row level security;
alter table public.project_charter_decisions enable row level security;

-- Import legacy validation content as governed drafts. Historical browser-only
-- approval labels are intentionally not promoted to server approval records.
insert into public.business_cases(workspace_id,project_id,status,current_version,owner_user_id,created_by,updated_by,created_at,updated_at)
select workspace_id,id,'draft',1,created_by,created_by,created_by,created_at,updated_at from public.projects where data ? 'business' on conflict(project_id) do nothing;
insert into public.business_case_versions(workspace_id,project_id,business_case_id,version,status,content,created_by,created_at,updated_at)
select p.workspace_id,p.id,b.id,1,'draft',coalesce(p.data->'business','{}'::jsonb)||jsonb_build_object('legacyImported',true),p.created_by,p.created_at,p.updated_at from public.projects p join public.business_cases b on b.project_id=p.id where not exists(select 1 from public.business_case_versions v where v.business_case_id=b.id);
insert into public.project_charters(workspace_id,project_id,status,current_version,owner_user_id,created_by,updated_by,created_at,updated_at)
select workspace_id,id,'draft',1,created_by,created_by,created_by,created_at,updated_at from public.projects where data ? 'charter' on conflict(project_id) do nothing;
insert into public.project_charter_versions(workspace_id,project_id,charter_id,version,status,content,created_by,created_at,updated_at)
select p.workspace_id,p.id,c.id,1,'draft',(coalesce(p.data->'charter','{}'::jsonb)-'approvedSnapshot'-'status'-'version')||jsonb_build_object('legacyImported',true),p.created_by,p.created_at,p.updated_at from public.projects p join public.project_charters c on c.project_id=p.id where not exists(select 1 from public.project_charter_versions v where v.charter_id=c.id);

create policy business_cases_member_read on public.business_cases for select to authenticated using(public.is_workspace_member(workspace_id));
create policy business_case_versions_member_read on public.business_case_versions for select to authenticated using(public.is_workspace_member(workspace_id));
create policy business_case_options_member_read on public.business_case_options for select to authenticated using(public.is_workspace_member(workspace_id));
create policy business_case_decisions_member_read on public.business_case_decisions for select to authenticated using(public.is_workspace_member(workspace_id));
create policy project_charters_member_read on public.project_charters for select to authenticated using(public.is_workspace_member(workspace_id));
create policy project_charter_versions_member_read on public.project_charter_versions for select to authenticated using(public.is_workspace_member(workspace_id));
create policy project_charter_decisions_member_read on public.project_charter_decisions for select to authenticated using(public.is_workspace_member(workspace_id));

grant select on table public.business_cases,public.business_case_versions,public.business_case_options,public.business_case_decisions,public.project_charters,public.project_charter_versions,public.project_charter_decisions to authenticated;
revoke insert,update,delete on public.business_cases,public.business_case_versions,public.business_case_options,public.business_case_decisions,public.project_charters,public.project_charter_versions,public.project_charter_decisions from authenticated;
revoke all on function public.save_business_case(uuid,integer,jsonb,jsonb),public.transition_business_case(uuid,integer,text,text),public.save_project_charter(uuid,integer,jsonb),public.transition_project_charter(uuid,integer,text,text) from public;
grant execute on function public.save_business_case(uuid,integer,jsonb,jsonb),public.transition_business_case(uuid,integer,text,text),public.save_project_charter(uuid,integer,jsonb),public.transition_project_charter(uuid,integer,text,text) to authenticated;

commit;
