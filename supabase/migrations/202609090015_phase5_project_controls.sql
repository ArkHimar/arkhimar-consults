begin;

create table public.project_control_sets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null unique references public.projects(id) on delete cascade,
  current_version integer not null default 0 check (current_version>=0),
  risk_plan jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.control_register_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  control_set_id uuid not null references public.project_control_sets(id) on delete cascade,
  version integer not null check (version>0),
  snapshot jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(control_set_id,version)
);

create table public.project_risks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  control_set_id uuid not null references public.project_control_sets(id) on delete cascade,
  risk_code text not null,
  risk_type text not null default 'Threat' check (risk_type in ('Threat','Opportunity')),
  cause text not null default '', event text not null, impact text not null default '', category text not null default '',
  affected_objective text not null default '', probability numeric not null default 1 check (probability between 1 and 5),
  impact_score numeric not null default 1 check (impact_score between 1 and 5), impact_dimensions jsonb not null default '{}'::jsonb,
  proximity text not null default '', urgency text not null default 'Medium', detectability numeric,
  owner_name text not null default '', response_strategy text not null default '', response_actions text not null default '',
  due_date date, triggers text not null default '', contingency_plan text not null default '', fallback_plan text not null default '',
  residual_probability numeric, residual_impact numeric, secondary_risk text not null default '',
  status text not null default 'Open', linked_artifact text not null default '', expected_monetary_value numeric,
  notes text not null default '', sort_order integer not null default 0,
  unique(control_set_id,risk_code)
);

create table public.project_issues (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade, control_set_id uuid not null references public.project_control_sets(id) on delete cascade,
  issue_code text not null, title text not null, description text not null default '', owner_name text not null default '',
  severity text not null default 'Medium', priority text not null default 'Medium', due_date date, status text not null default 'Open',
  escalation text not null default '', linked_artifact text not null default '', resolution text not null default '',
  root_cause text not null default '', reminder_date date, notes text not null default '', sort_order integer not null default 0,
  unique(control_set_id,issue_code)
);

create table public.project_stakeholders (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade, control_set_id uuid not null references public.project_control_sets(id) on delete cascade,
  stakeholder_code text not null, name text not null, role_title text not null default '', organization text not null default '',
  influence integer not null default 3 check (influence between 1 and 5), interest integer not null default 3 check (interest between 1 and 5),
  impact integer not null default 3 check (impact between 1 and 5), current_engagement text not null default 'Neutral', desired_engagement text not null default 'Supportive',
  expectations text not null default '', concerns text not null default '', communication_preference text not null default '',
  owner_name text not null default '', confidentiality text not null default 'Internal', status text not null default 'Active', sort_order integer not null default 0,
  unique(control_set_id,stakeholder_code)
);

create table public.stakeholder_private_notes (
  stakeholder_id uuid primary key references public.project_stakeholders(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade,
  note text not null default '', updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now()
);

create table public.stakeholder_engagement_actions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade, control_set_id uuid not null references public.project_control_sets(id) on delete cascade,
  stakeholder_id uuid not null references public.project_stakeholders(id) on delete cascade,
  action text not null, owner_name text not null default '', due_date date, channel text not null default '', outcome text not null default '', status text not null default 'Planned'
);

create table public.change_requests (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade, request_code text not null,
  requester text not null default '', requested_at date not null default current_date, title text not null, description text not null default '', reason text not null default '',
  change_type text not null default 'Scope', urgency text not null default 'Medium', affected_requirements text not null default '',
  affected_scope text not null default '', affected_wbs text not null default '', schedule_impact text not null default '', cost_impact numeric not null default 0,
  quality_impact text not null default '', resource_impact text not null default '', risk_impact text not null default '', contract_impact text not null default '',
  benefits_impact text not null default '', regulatory_security_impact text not null default '', impact_assessment text not null default '',
  recommendation text not null default '', decision_comments text not null default '', status text not null default 'draft'
    check (status in ('draft','submitted','impact_analysis','ccb_review','approved','rejected','deferred','implementation','verification','closed')),
  created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id), approved_by uuid references auth.users(id),
  approved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(project_id,request_code)
);

create table public.change_request_history (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade, change_request_id uuid not null references public.change_requests(id) on delete cascade,
  from_status text, to_status text not null, comments text not null default '', snapshot jsonb not null,
  actor_user_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);

create index project_risks_project_idx on public.project_risks(project_id,status);
create index project_issues_project_idx on public.project_issues(project_id,status);
create index project_stakeholders_project_idx on public.project_stakeholders(project_id,status);
create index change_requests_project_idx on public.change_requests(project_id,status);
create index change_request_history_change_idx on public.change_request_history(change_request_id,created_at desc);

create trigger protect_control_register_versions before update or delete on public.control_register_versions for each row execute function public.protect_approved_planning_records();
create trigger protect_change_request_history before update or delete on public.change_request_history for each row execute function public.protect_approved_planning_records();

create or replace function public.save_project_controls(target_project uuid, expected_version integer, plan_content jsonb, risks_payload jsonb, issues_payload jsonb, stakeholders_payload jsonb, engagements_payload jsonb, changes_payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare target_workspace uuid; actor_role public.workspace_role; controls public.project_control_sets; next_version integer; item jsonb; target_id uuid; snap jsonb;
begin
  if jsonb_typeof(coalesce(plan_content,'{}'))<>'object' or jsonb_typeof(coalesce(risks_payload,'[]'))<>'array' or jsonb_typeof(coalesce(issues_payload,'[]'))<>'array' or jsonb_typeof(coalesce(stakeholders_payload,'[]'))<>'array' or jsonb_typeof(coalesce(engagements_payload,'[]'))<>'array' or jsonb_typeof(coalesce(changes_payload,'[]'))<>'array' then raise exception 'Invalid project controls payload'; end if;
  select workspace_id into target_workspace from public.projects where id=target_project;
  actor_role:=public.workspace_role_for(target_workspace);
  if target_workspace is null or actor_role not in ('owner','admin','project_manager') then raise exception 'Project manager permission required'; end if;
  select * into controls from public.project_control_sets where project_id=target_project for update;
  if controls.id is null then
    if expected_version not in (0,1) then raise exception 'Control register version conflict'; end if;
    insert into public.project_control_sets(workspace_id,project_id,risk_plan,created_by,updated_by) values(target_workspace,target_project,plan_content,auth.uid(),auth.uid()) returning * into controls;
  elsif controls.current_version<>expected_version then raise exception 'Control register version conflict';
  end if;
  next_version:=controls.current_version+1;
  delete from public.stakeholder_engagement_actions where control_set_id=controls.id;
  delete from public.stakeholder_private_notes where project_id=target_project;
  delete from public.project_stakeholders where control_set_id=controls.id;
  delete from public.project_issues where control_set_id=controls.id;
  delete from public.project_risks where control_set_id=controls.id;
  for item in select value from jsonb_array_elements(risks_payload) loop
    insert into public.project_risks(id,workspace_id,project_id,control_set_id,risk_code,risk_type,cause,event,impact,category,affected_objective,probability,impact_score,impact_dimensions,proximity,urgency,detectability,owner_name,response_strategy,response_actions,due_date,triggers,contingency_plan,fallback_plan,residual_probability,residual_impact,secondary_risk,status,linked_artifact,expected_monetary_value,notes,sort_order)
    values(coalesce(nullif(item->>'id','')::uuid,gen_random_uuid()),target_workspace,target_project,controls.id,item->>'code',coalesce(item->>'type','Threat'),coalesce(item->>'cause',''),item->>'event',coalesce(item->>'impact',''),coalesce(item->>'category',''),coalesce(item->>'objective',''),greatest(1,least(5,coalesce(nullif(item->>'probability','')::numeric,1))),greatest(1,least(5,coalesce(nullif(item->>'impactScore','')::numeric,1))),coalesce(item->'impactDimensions','{}'),coalesce(item->>'proximity',''),coalesce(item->>'urgency','Medium'),nullif(item->>'detectability','')::numeric,coalesce(item->>'owner',''),coalesce(item->>'strategy',''),coalesce(item->>'actions',''),nullif(item->>'dueDate','')::date,coalesce(item->>'triggers',''),coalesce(item->>'contingency',''),coalesce(item->>'fallback',''),nullif(item->>'residualProbability','')::numeric,nullif(item->>'residualImpact','')::numeric,coalesce(item->>'secondaryRisk',''),coalesce(item->>'status','Open'),coalesce(item->>'linkedArtifact',''),nullif(item->>'emv','')::numeric,coalesce(item->>'notes',''),coalesce(nullif(item->>'sortOrder','')::integer,0));
  end loop;
  for item in select value from jsonb_array_elements(issues_payload) loop
    insert into public.project_issues(id,workspace_id,project_id,control_set_id,issue_code,title,description,owner_name,severity,priority,due_date,status,escalation,linked_artifact,resolution,root_cause,reminder_date,notes,sort_order)
    values(coalesce(nullif(item->>'id','')::uuid,gen_random_uuid()),target_workspace,target_project,controls.id,item->>'code',item->>'title',coalesce(item->>'description',''),coalesce(item->>'owner',''),coalesce(item->>'severity','Medium'),coalesce(item->>'priority','Medium'),nullif(item->>'dueDate','')::date,coalesce(item->>'status','Open'),coalesce(item->>'escalation',''),coalesce(item->>'linkedArtifact',''),coalesce(item->>'resolution',''),coalesce(item->>'rootCause',''),nullif(item->>'reminderDate','')::date,coalesce(item->>'notes',''),coalesce(nullif(item->>'sortOrder','')::integer,0));
  end loop;
  for item in select value from jsonb_array_elements(stakeholders_payload) loop
    target_id:=coalesce(nullif(item->>'id','')::uuid,gen_random_uuid());
    insert into public.project_stakeholders(id,workspace_id,project_id,control_set_id,stakeholder_code,name,role_title,organization,influence,interest,impact,current_engagement,desired_engagement,expectations,concerns,communication_preference,owner_name,confidentiality,status,sort_order)
    values(target_id,target_workspace,target_project,controls.id,item->>'code',item->>'name',coalesce(item->>'role',''),coalesce(item->>'organization',''),greatest(1,least(5,coalesce(nullif(item->>'influence','')::integer,3))),greatest(1,least(5,coalesce(nullif(item->>'interest','')::integer,3))),greatest(1,least(5,coalesce(nullif(item->>'impact','')::integer,3))),coalesce(item->>'currentEngagement','Neutral'),coalesce(item->>'desiredEngagement','Supportive'),coalesce(item->>'expectations',''),coalesce(item->>'concerns',''),coalesce(item->>'communicationPreference',''),coalesce(item->>'owner',''),coalesce(item->>'confidentiality','Internal'),coalesce(item->>'status','Active'),coalesce(nullif(item->>'sortOrder','')::integer,0));
    if actor_role in ('owner','admin','project_manager') and nullif(item->>'privateNotes','') is not null then insert into public.stakeholder_private_notes(stakeholder_id,workspace_id,project_id,note,updated_by) values(target_id,target_workspace,target_project,item->>'privateNotes',auth.uid()); end if;
  end loop;
  for item in select value from jsonb_array_elements(engagements_payload) loop
    target_id:=nullif(item->>'stakeholderId','')::uuid;
    if not exists(select 1 from public.project_stakeholders where id=target_id and control_set_id=controls.id) then raise exception 'Engagement references an unknown stakeholder'; end if;
    insert into public.stakeholder_engagement_actions(id,workspace_id,project_id,control_set_id,stakeholder_id,action,owner_name,due_date,channel,outcome,status) values(coalesce(nullif(item->>'id','')::uuid,gen_random_uuid()),target_workspace,target_project,controls.id,target_id,item->>'action',coalesce(item->>'owner',''),nullif(item->>'dueDate','')::date,coalesce(item->>'channel',''),coalesce(item->>'outcome',''),coalesce(item->>'status','Planned'));
  end loop;
  for item in select value from jsonb_array_elements(changes_payload) loop
    target_id:=coalesce(nullif(item->>'id','')::uuid,gen_random_uuid());
    if exists(select 1 from public.change_requests where id=target_id) then
      if not exists(select 1 from public.change_requests where id=target_id and project_id=target_project and status='draft') then continue; end if;
      update public.change_requests set request_code=item->>'code',requester=coalesce(item->>'requester',''),requested_at=coalesce(nullif(item->>'requestedAt','')::date,current_date),title=item->>'title',description=coalesce(item->>'description',''),reason=coalesce(item->>'reason',''),change_type=coalesce(item->>'type','Scope'),urgency=coalesce(item->>'urgency','Medium'),affected_requirements=coalesce(item->>'requirements',''),affected_scope=coalesce(item->>'scope',''),affected_wbs=coalesce(item->>'wbs',''),schedule_impact=coalesce(item->>'scheduleImpact',''),cost_impact=coalesce(nullif(item->>'costImpact','')::numeric,0),quality_impact=coalesce(item->>'qualityImpact',''),resource_impact=coalesce(item->>'resourceImpact',''),risk_impact=coalesce(item->>'riskImpact',''),contract_impact=coalesce(item->>'contractImpact',''),benefits_impact=coalesce(item->>'benefitsImpact',''),regulatory_security_impact=coalesce(item->>'securityImpact',''),impact_assessment=coalesce(item->>'assessment',''),recommendation=coalesce(item->>'recommendation',''),updated_by=auth.uid(),updated_at=now() where id=target_id;
    else
      insert into public.change_requests(id,workspace_id,project_id,request_code,requester,requested_at,title,description,reason,change_type,urgency,affected_requirements,affected_scope,affected_wbs,schedule_impact,cost_impact,quality_impact,resource_impact,risk_impact,contract_impact,benefits_impact,regulatory_security_impact,impact_assessment,recommendation,created_by,updated_by)
      values(target_id,target_workspace,target_project,item->>'code',coalesce(item->>'requester',''),coalesce(nullif(item->>'requestedAt','')::date,current_date),item->>'title',coalesce(item->>'description',''),coalesce(item->>'reason',''),coalesce(item->>'type','Scope'),coalesce(item->>'urgency','Medium'),coalesce(item->>'requirements',''),coalesce(item->>'scope',''),coalesce(item->>'wbs',''),coalesce(item->>'scheduleImpact',''),coalesce(nullif(item->>'costImpact','')::numeric,0),coalesce(item->>'qualityImpact',''),coalesce(item->>'resourceImpact',''),coalesce(item->>'riskImpact',''),coalesce(item->>'contractImpact',''),coalesce(item->>'benefitsImpact',''),coalesce(item->>'securityImpact',''),coalesce(item->>'assessment',''),coalesce(item->>'recommendation',''),auth.uid(),auth.uid());
      insert into public.change_request_history(workspace_id,project_id,change_request_id,to_status,comments,snapshot,actor_user_id) values(target_workspace,target_project,target_id,'draft','Created',item,auth.uid());
    end if;
  end loop;
  snap:=jsonb_build_object('riskPlan',plan_content,'risks',risks_payload,'issues',issues_payload,'stakeholders',stakeholders_payload,'engagements',engagements_payload);
  insert into public.control_register_versions(workspace_id,project_id,control_set_id,version,snapshot,created_by) values(target_workspace,target_project,controls.id,next_version,snap,auth.uid());
  update public.project_control_sets set current_version=next_version,risk_plan=plan_content,updated_by=auth.uid(),updated_at=now() where id=controls.id;
  insert into public.audit_events(workspace_id,project_id,actor_user_id,action,entity_type,entity_id,metadata) values(target_workspace,target_project,auth.uid(),'saved','project_controls',controls.id::text,jsonb_build_object('version',next_version,'risks',jsonb_array_length(risks_payload),'issues',jsonb_array_length(issues_payload),'stakeholders',jsonb_array_length(stakeholders_payload)));
  return jsonb_build_object('version',next_version,'status','saved');
end $$;

create or replace function public.transition_change_request(target_change uuid, next_status text, transition_comments text default '') returns jsonb language plpgsql security definer set search_path=public as $$
declare request public.change_requests; actor_role public.workspace_role; allowed boolean:=false;
begin
  select * into request from public.change_requests where id=target_change for update;
  if request.id is null then raise exception 'Change request not found'; end if;
  actor_role:=public.workspace_role_for(request.workspace_id);
  if actor_role not in ('owner','admin','project_manager') then raise exception 'Project manager permission required'; end if;
  if request.status='draft' and next_status='submitted' then allowed:=true;
  elsif request.status='submitted' and next_status='impact_analysis' then allowed:=true;
  elsif request.status='impact_analysis' and next_status='ccb_review' then allowed:=true;
  elsif request.status='deferred' and next_status='impact_analysis' then allowed:=true;
  elsif request.status='approved' and next_status='implementation' then allowed:=true;
  elsif request.status='implementation' and next_status='verification' then allowed:=true;
  elsif request.status='ccb_review' and next_status in ('approved','rejected','deferred') and actor_role in ('owner','admin') then allowed:=true;
  elsif request.status='verification' and next_status='closed' and actor_role in ('owner','admin') then allowed:=true;
  end if;
  if not allowed then raise exception 'Change transition not permitted'; end if;
  insert into public.change_request_history(workspace_id,project_id,change_request_id,from_status,to_status,comments,snapshot,actor_user_id) values(request.workspace_id,request.project_id,request.id,request.status,next_status,coalesce(transition_comments,''),to_jsonb(request),auth.uid());
  update public.change_requests set status=next_status,decision_comments=case when next_status in ('approved','rejected','deferred') then coalesce(transition_comments,'') else decision_comments end,approved_by=case when next_status='approved' then auth.uid() else approved_by end,approved_at=case when next_status='approved' then now() else approved_at end,updated_by=auth.uid(),updated_at=now() where id=request.id;
  insert into public.audit_events(workspace_id,project_id,actor_user_id,action,entity_type,entity_id,metadata) values(request.workspace_id,request.project_id,auth.uid(),'transitioned','change_request',request.id::text,jsonb_build_object('from',request.status,'to',next_status,'comments',coalesce(transition_comments,'')));
  return jsonb_build_object('id',request.id,'status',next_status);
end $$;

alter table public.project_control_sets enable row level security;
alter table public.control_register_versions enable row level security;
alter table public.project_risks enable row level security;
alter table public.project_issues enable row level security;
alter table public.project_stakeholders enable row level security;
alter table public.stakeholder_private_notes enable row level security;
alter table public.stakeholder_engagement_actions enable row level security;
alter table public.change_requests enable row level security;
alter table public.change_request_history enable row level security;

create policy project_control_sets_member_read on public.project_control_sets for select to authenticated using(public.is_workspace_member(workspace_id));
create policy control_register_versions_member_read on public.control_register_versions for select to authenticated using(public.is_workspace_member(workspace_id));
create policy project_risks_member_read on public.project_risks for select to authenticated using(public.is_workspace_member(workspace_id));
create policy project_issues_member_read on public.project_issues for select to authenticated using(public.is_workspace_member(workspace_id));
create policy project_stakeholders_member_read on public.project_stakeholders for select to authenticated using(public.is_workspace_member(workspace_id));
create policy stakeholder_private_notes_manager_read on public.stakeholder_private_notes for select to authenticated using(public.workspace_role_for(workspace_id) in ('owner','admin','project_manager'));
create policy stakeholder_engagement_actions_member_read on public.stakeholder_engagement_actions for select to authenticated using(public.is_workspace_member(workspace_id));
create policy change_requests_member_read on public.change_requests for select to authenticated using(public.is_workspace_member(workspace_id));
create policy change_request_history_member_read on public.change_request_history for select to authenticated using(public.is_workspace_member(workspace_id));

grant select on public.project_control_sets,public.control_register_versions,public.project_risks,public.project_issues,public.project_stakeholders,public.stakeholder_engagement_actions,public.change_requests,public.change_request_history to authenticated;
grant select on public.stakeholder_private_notes to authenticated;
revoke insert,update,delete on public.project_control_sets,public.control_register_versions,public.project_risks,public.project_issues,public.project_stakeholders,public.stakeholder_private_notes,public.stakeholder_engagement_actions,public.change_requests,public.change_request_history from authenticated;
revoke all on function public.save_project_controls(uuid,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb),public.transition_change_request(uuid,text,text) from public;
grant execute on function public.save_project_controls(uuid,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb),public.transition_change_request(uuid,text,text) to authenticated;

commit;
