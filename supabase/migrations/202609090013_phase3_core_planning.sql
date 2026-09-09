begin;

create table public.core_planning_sets (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null, current_version integer not null default 1 check(current_version>0),
  status text not null default 'draft' check(status in ('draft','baselined','archived')),
  revision_reference text,
  created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(project_id), unique(id,workspace_id),
  foreign key(project_id,workspace_id) references public.projects(id,workspace_id) on delete cascade
);

create table public.core_planning_versions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, project_id uuid not null,
  planning_set_id uuid not null, version integer not null check(version>0),
  status text not null default 'draft' check(status in ('draft','approved','superseded')),
  master_plan jsonb not null default '{}'::jsonb check(jsonb_typeof(master_plan)='object'),
  scope_statement jsonb not null default '{}'::jsonb check(jsonb_typeof(scope_statement)='object'),
  subsidiary_plans jsonb not null default '[]'::jsonb check(jsonb_typeof(subsidiary_plans)='array'),
  created_by uuid not null references auth.users(id), approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(planning_set_id,version),
  foreign key(planning_set_id,workspace_id) references public.core_planning_sets(id,workspace_id) on delete cascade,
  foreign key(project_id,workspace_id) references public.projects(id,workspace_id) on delete cascade
);

create table public.requirements (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, project_id uuid not null,
  planning_version_id uuid not null references public.core_planning_versions(id) on delete cascade,
  requirement_code text not null, description text not null check(nullif(trim(description),'') is not null),
  category text not null default 'Business', source text not null default '', owner_name text not null default '', stakeholder text not null default '',
  priority text not null default 'Must', acceptance_criteria text not null default '', rationale text not null default '',
  status text not null default 'Proposed', target_release text not null default '', verification_method text not null default '', validation_method text not null default '',
  deliverable_ref text not null default '', wbs_ref text not null default '', evidence_ref text not null default '', change_history text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(planning_version_id,requirement_code),
  foreign key(project_id,workspace_id) references public.projects(id,workspace_id) on delete cascade
);

create table public.requirement_traces (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, project_id uuid not null,
  planning_version_id uuid not null references public.core_planning_versions(id) on delete cascade,
  requirement_id uuid not null references public.requirements(id) on delete cascade,
  strategic_objective text not null default '', benefit text not null default '', deliverable text not null default '',
  wbs_code text not null default '', activity_ref text not null default '', acceptance_evidence text not null default '', status text not null default 'Untraced',
  created_at timestamptz not null default now(), unique(planning_version_id,requirement_id),
  foreign key(project_id,workspace_id) references public.projects(id,workspace_id) on delete cascade
);

create table public.wbs_nodes (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, project_id uuid not null,
  planning_version_id uuid not null references public.core_planning_versions(id) on delete cascade,
  node_key text not null, parent_key text, outline_number text not null, sort_order integer not null default 0,
  node_type text not null default 'Work package' check(node_type in ('Control account','Planning package','Work package')),
  name text not null check(nullif(trim(name),'') is not null), owner_name text not null default '', estimated_effort numeric(14,2) not null default 0,
  estimated_cost numeric(18,2) not null default 0, linked_requirements text not null default '', linked_deliverables text not null default '',
  dictionary jsonb not null default '{}'::jsonb check(jsonb_typeof(dictionary)='object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(planning_version_id,node_key), unique(planning_version_id,outline_number),
  foreign key(project_id,workspace_id) references public.projects(id,workspace_id) on delete cascade
);

create table public.scope_baselines (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, project_id uuid not null,
  planning_set_id uuid not null, planning_version_id uuid not null references public.core_planning_versions(id),
  version integer not null check(version>0), name text not null, status text not null default 'approved' check(status in ('approved','superseded')),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'), source_versions jsonb not null default '{}'::jsonb,
  change_request_id text, supersedes_baseline_id uuid references public.scope_baselines(id),
  approved_by uuid not null references auth.users(id), approved_at timestamptz not null default now(),
  unique(planning_set_id,version),
  foreign key(planning_set_id,workspace_id) references public.core_planning_sets(id,workspace_id) on delete cascade,
  foreign key(project_id,workspace_id) references public.projects(id,workspace_id) on delete cascade
);

create index core_planning_project_idx on public.core_planning_sets(workspace_id,project_id);
create index core_planning_versions_idx on public.core_planning_versions(planning_set_id,version desc);
create index requirements_project_idx on public.requirements(project_id,requirement_code);
create index requirement_traces_project_idx on public.requirement_traces(project_id,status);
create index wbs_nodes_project_idx on public.wbs_nodes(project_id,sort_order);
create index scope_baselines_project_idx on public.scope_baselines(project_id,version desc);

create or replace function public.protect_approved_planning_records() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' then raise exception 'Approved planning records are immutable'; end if;
  if (to_jsonb(new)-'status')=(to_jsonb(old)-'status') and old.status='approved' and new.status='superseded' then return new; end if;
  raise exception 'Approved planning records are immutable';
end $$;
create trigger protect_core_planning_versions before update or delete on public.core_planning_versions for each row when(old.status in ('approved','superseded')) execute procedure public.protect_approved_planning_records();
create trigger protect_scope_baselines before update or delete on public.scope_baselines for each row execute procedure public.protect_approved_planning_records();

create or replace function public.save_core_planning(target_project uuid,expected_version integer,master_content jsonb,scope_content jsonb,plan_items jsonb,requirement_items jsonb,wbs_items jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare target_workspace uuid; actor_role public.workspace_role; artifact public.core_planning_sets; artifact_version public.core_planning_versions; item jsonb; new_requirement uuid;
begin
  if jsonb_typeof(coalesce(master_content,'{}'))<>'object' or jsonb_typeof(coalesce(scope_content,'{}'))<>'object' or jsonb_typeof(coalesce(plan_items,'[]'))<>'array' or jsonb_typeof(coalesce(requirement_items,'[]'))<>'array' or jsonb_typeof(coalesce(wbs_items,'[]'))<>'array' then raise exception 'Invalid planning payload'; end if;
  select workspace_id into target_workspace from public.projects where id=target_project;
  actor_role:=public.workspace_role_for(target_workspace);
  if target_workspace is null or actor_role not in ('owner','admin','project_manager') then raise exception 'Project manager permission required'; end if;
  select * into artifact from public.core_planning_sets where project_id=target_project for update;
  if artifact.id is null then
    if expected_version not in (0,1) then raise exception 'Planning version conflict'; end if;
    insert into public.core_planning_sets(workspace_id,project_id,created_by,updated_by) values(target_workspace,target_project,auth.uid(),auth.uid()) returning * into artifact;
    insert into public.core_planning_versions(workspace_id,project_id,planning_set_id,version,master_plan,scope_statement,subsidiary_plans,created_by) values(target_workspace,target_project,artifact.id,1,master_content,scope_content,plan_items,auth.uid()) returning * into artifact_version;
  else
    if artifact.current_version<>expected_version then raise exception 'Planning version conflict'; end if;
    if artifact.status<>'draft' then raise exception 'Start an authorized baseline revision before editing'; end if;
    select * into artifact_version from public.core_planning_versions where planning_set_id=artifact.id and version=artifact.current_version for update;
    update public.core_planning_versions set master_plan=master_content,scope_statement=scope_content,subsidiary_plans=plan_items,updated_at=now() where id=artifact_version.id;
    delete from public.requirement_traces where planning_version_id=artifact_version.id;
    delete from public.requirements where planning_version_id=artifact_version.id;
    delete from public.wbs_nodes where planning_version_id=artifact_version.id;
  end if;
  for item in select value from jsonb_array_elements(requirement_items) loop
    insert into public.requirements(id,workspace_id,project_id,planning_version_id,requirement_code,description,category,source,owner_name,stakeholder,priority,acceptance_criteria,rationale,status,target_release,verification_method,validation_method,deliverable_ref,wbs_ref,evidence_ref,change_history)
    values(coalesce(nullif(item->>'id','')::uuid,gen_random_uuid()),target_workspace,target_project,artifact_version.id,item->>'code',item->>'description',coalesce(item->>'category','Business'),coalesce(item->>'source',''),coalesce(item->>'owner',''),coalesce(item->>'stakeholder',''),coalesce(item->>'priority','Must'),coalesce(item->>'acceptanceCriteria',''),coalesce(item->>'rationale',''),coalesce(item->>'status','Proposed'),coalesce(item->>'targetRelease',''),coalesce(item->>'verificationMethod',''),coalesce(item->>'validationMethod',''),coalesce(item->>'deliverable',''),coalesce(item->>'wbs',''),coalesce(item->>'evidence',''),coalesce(item->>'changeHistory','')) returning id into new_requirement;
    insert into public.requirement_traces(workspace_id,project_id,planning_version_id,requirement_id,strategic_objective,benefit,deliverable,wbs_code,activity_ref,acceptance_evidence,status)
    values(target_workspace,target_project,artifact_version.id,new_requirement,coalesce(item->>'objective',''),coalesce(item->>'benefit',''),coalesce(item->>'deliverable',''),coalesce(item->>'wbs',''),coalesce(item->>'activity',''),coalesce(item->>'evidence',''),case when nullif(item->>'deliverable','') is null or nullif(item->>'wbs','') is null then 'Untraced' else coalesce(item->>'traceStatus','Traced') end);
  end loop;
  for item in select value from jsonb_array_elements(wbs_items) loop
    insert into public.wbs_nodes(id,workspace_id,project_id,planning_version_id,node_key,parent_key,outline_number,sort_order,node_type,name,owner_name,estimated_effort,estimated_cost,linked_requirements,linked_deliverables,dictionary)
    values(coalesce(nullif(item->>'id','')::uuid,gen_random_uuid()),target_workspace,target_project,artifact_version.id,item->>'key',nullif(item->>'parentKey',''),item->>'outline',coalesce(nullif(item->>'sortOrder','')::integer,0),coalesce(item->>'type','Work package'),item->>'name',coalesce(item->>'owner',''),greatest(0,coalesce(nullif(item->>'effort','')::numeric,0)),greatest(0,coalesce(nullif(item->>'cost','')::numeric,0)),coalesce(item->>'requirements',''),coalesce(item->>'deliverables',''),coalesce(item->'dictionary','{}'));
  end loop;
  update public.core_planning_sets set updated_by=auth.uid(),updated_at=now() where id=artifact.id;
  insert into public.audit_events(workspace_id,project_id,actor_user_id,action,entity_type,entity_id,metadata) values(target_workspace,target_project,auth.uid(),'saved','core_planning',artifact.id::text,jsonb_build_object('version',artifact.current_version,'requirements',jsonb_array_length(requirement_items),'wbs_nodes',jsonb_array_length(wbs_items)));
  return jsonb_build_object('id',artifact.id,'version',artifact.current_version,'status',artifact.status);
end $$;

create or replace function public.approve_scope_baseline(target_project uuid,expected_version integer,baseline_name text default 'Scope baseline') returns jsonb language plpgsql security definer set search_path=public as $$
declare artifact public.core_planning_sets; artifact_version public.core_planning_versions; actor_role public.workspace_role; baseline_version integer; prior uuid; snap jsonb;
begin
  select * into artifact from public.core_planning_sets where project_id=target_project for update;
  if artifact.id is null or artifact.current_version<>expected_version or artifact.status<>'draft' then raise exception 'Planning version conflict or no draft revision'; end if;
  actor_role:=public.workspace_role_for(artifact.workspace_id); if actor_role not in ('owner','admin') then raise exception 'Owner or admin approval required'; end if;
  select * into artifact_version from public.core_planning_versions where planning_set_id=artifact.id and version=artifact.current_version for update;
  if nullif(trim(artifact_version.scope_statement->>'projectScope'),'') is null then raise exception 'Project scope is required'; end if;
  if not exists(select 1 from public.wbs_nodes where planning_version_id=artifact_version.id) then raise exception 'At least one WBS node is required'; end if;
  baseline_version:=coalesce((select max(version)+1 from public.scope_baselines where planning_set_id=artifact.id),1);
  select id into prior from public.scope_baselines where planning_set_id=artifact.id and status='approved' order by version desc limit 1;
  if prior is not null then update public.scope_baselines set status='superseded' where id=prior; end if;
  snap:=jsonb_build_object('masterPlan',artifact_version.master_plan,'scopeStatement',artifact_version.scope_statement,'subsidiaryPlans',artifact_version.subsidiary_plans,'requirements',coalesce((select jsonb_agg(to_jsonb(r) order by requirement_code) from public.requirements r where planning_version_id=artifact_version.id),'[]'),'requirementTraces',coalesce((select jsonb_agg(to_jsonb(t)) from public.requirement_traces t where planning_version_id=artifact_version.id),'[]'),'wbs',coalesce((select jsonb_agg(to_jsonb(w) order by sort_order) from public.wbs_nodes w where planning_version_id=artifact_version.id),'[]'));
  update public.core_planning_versions set status='approved',approved_by=auth.uid(),approved_at=now() where id=artifact_version.id;
  insert into public.scope_baselines(workspace_id,project_id,planning_set_id,planning_version_id,version,name,snapshot,source_versions,change_request_id,supersedes_baseline_id,approved_by) values(artifact.workspace_id,artifact.project_id,artifact.id,artifact_version.id,baseline_version,coalesce(nullif(trim(baseline_name),''),'Scope baseline'),snap,jsonb_build_object('planning',artifact.current_version),artifact.revision_reference,prior,auth.uid());
  update public.core_planning_sets set status='baselined',revision_reference=null,updated_by=auth.uid(),updated_at=now() where id=artifact.id;
  insert into public.audit_events(workspace_id,project_id,actor_user_id,action,entity_type,entity_id,metadata) values(artifact.workspace_id,artifact.project_id,auth.uid(),'approved','scope_baseline',artifact.id::text,jsonb_build_object('version',baseline_version,'planning_version',artifact.current_version));
  return jsonb_build_object('version',baseline_version,'status','baselined');
end $$;

create or replace function public.begin_scope_revision(target_project uuid,expected_version integer,change_reference text default '') returns jsonb language plpgsql security definer set search_path=public as $$
declare artifact public.core_planning_sets; current_record public.core_planning_versions; actor_role public.workspace_role; next_version integer;
begin
  select * into artifact from public.core_planning_sets where project_id=target_project for update;
  if artifact.id is null or artifact.current_version<>expected_version or artifact.status<>'baselined' then raise exception 'Planning version conflict or baseline is not current'; end if;
  actor_role:=public.workspace_role_for(artifact.workspace_id); if actor_role not in ('owner','admin','project_manager') then raise exception 'Project manager permission required'; end if;
  if nullif(trim(change_reference),'') is null then raise exception 'An approved change or revision authorization reference is required'; end if;
  select * into current_record from public.core_planning_versions where planning_set_id=artifact.id and version=artifact.current_version;
  next_version:=artifact.current_version+1;
  insert into public.core_planning_versions(workspace_id,project_id,planning_set_id,version,master_plan,scope_statement,subsidiary_plans,created_by) values(artifact.workspace_id,artifact.project_id,artifact.id,next_version,current_record.master_plan,current_record.scope_statement,current_record.subsidiary_plans,auth.uid());
  insert into public.requirements(workspace_id,project_id,planning_version_id,requirement_code,description,category,source,owner_name,stakeholder,priority,acceptance_criteria,rationale,status,target_release,verification_method,validation_method,deliverable_ref,wbs_ref,evidence_ref,change_history)
    select workspace_id,project_id,(select id from public.core_planning_versions where planning_set_id=artifact.id and version=next_version),requirement_code,description,category,source,owner_name,stakeholder,priority,acceptance_criteria,rationale,status,target_release,verification_method,validation_method,deliverable_ref,wbs_ref,evidence_ref,concat_ws(E'\n',nullif(change_history,''),'Revision authorized: '||trim(change_reference)) from public.requirements where planning_version_id=current_record.id;
  insert into public.requirement_traces(workspace_id,project_id,planning_version_id,requirement_id,strategic_objective,benefit,deliverable,wbs_code,activity_ref,acceptance_evidence,status)
    select r.workspace_id,r.project_id,r.planning_version_id,r.id,t.strategic_objective,t.benefit,t.deliverable,t.wbs_code,t.activity_ref,t.acceptance_evidence,t.status from public.requirements r join public.requirements old on old.requirement_code=r.requirement_code and old.planning_version_id=current_record.id join public.requirement_traces t on t.requirement_id=old.id where r.planning_version_id=(select id from public.core_planning_versions where planning_set_id=artifact.id and version=next_version);
  insert into public.wbs_nodes(workspace_id,project_id,planning_version_id,node_key,parent_key,outline_number,sort_order,node_type,name,owner_name,estimated_effort,estimated_cost,linked_requirements,linked_deliverables,dictionary)
    select workspace_id,project_id,(select id from public.core_planning_versions where planning_set_id=artifact.id and version=next_version),node_key,parent_key,outline_number,sort_order,node_type,name,owner_name,estimated_effort,estimated_cost,linked_requirements,linked_deliverables,dictionary from public.wbs_nodes where planning_version_id=current_record.id;
  update public.core_planning_sets set current_version=next_version,status='draft',revision_reference=trim(change_reference),updated_by=auth.uid(),updated_at=now() where id=artifact.id;
  insert into public.audit_events(workspace_id,project_id,actor_user_id,action,entity_type,entity_id,metadata) values(artifact.workspace_id,artifact.project_id,auth.uid(),'revision_started','scope_baseline',artifact.id::text,jsonb_build_object('planning_version',next_version,'authorization',trim(change_reference)));
  return jsonb_build_object('version',next_version,'status','draft');
end $$;

alter table public.core_planning_sets enable row level security; alter table public.core_planning_versions enable row level security;
alter table public.requirements enable row level security; alter table public.requirement_traces enable row level security; alter table public.wbs_nodes enable row level security; alter table public.scope_baselines enable row level security;
create policy core_planning_sets_member_read on public.core_planning_sets for select to authenticated using(public.is_workspace_member(workspace_id));
create policy core_planning_versions_member_read on public.core_planning_versions for select to authenticated using(public.is_workspace_member(workspace_id));
create policy requirements_member_read on public.requirements for select to authenticated using(public.is_workspace_member(workspace_id));
create policy requirement_traces_member_read on public.requirement_traces for select to authenticated using(public.is_workspace_member(workspace_id));
create policy wbs_nodes_member_read on public.wbs_nodes for select to authenticated using(public.is_workspace_member(workspace_id));
create policy scope_baselines_member_read on public.scope_baselines for select to authenticated using(public.is_workspace_member(workspace_id));
grant select on public.core_planning_sets,public.core_planning_versions,public.requirements,public.requirement_traces,public.wbs_nodes,public.scope_baselines to authenticated;
revoke insert,update,delete on public.core_planning_sets,public.core_planning_versions,public.requirements,public.requirement_traces,public.wbs_nodes,public.scope_baselines from authenticated;
revoke all on function public.save_core_planning(uuid,integer,jsonb,jsonb,jsonb,jsonb,jsonb),public.approve_scope_baseline(uuid,integer,text),public.begin_scope_revision(uuid,integer,text) from public;
grant execute on function public.save_core_planning(uuid,integer,jsonb,jsonb,jsonb,jsonb,jsonb),public.approve_scope_baseline(uuid,integer,text),public.begin_scope_revision(uuid,integer,text) to authenticated;

commit;
