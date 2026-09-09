begin;

create table public.execution_control_sets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null unique references public.projects(id) on delete cascade,
  current_version integer not null default 0,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.execution_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  execution_set_id uuid not null references public.execution_control_sets(id) on delete cascade,
  version integer not null,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(execution_set_id,version)
);

create table public.delivery_iterations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  execution_version_id uuid not null references public.execution_versions(id) on delete cascade,
  iteration_code text not null,
  name text not null,
  iteration_type text not null default 'Sprint',
  goal text not null default '',
  start_date date,
  end_date date,
  status text not null default 'Planned',
  capacity numeric not null default 0 check(capacity >= 0),
  planned_points numeric not null default 0 check(planned_points >= 0),
  completed_points numeric not null default 0 check(completed_points >= 0),
  review_outcome text not null default '',
  retrospective text not null default '',
  sort_order integer not null default 0,
  unique(execution_version_id,iteration_code)
);

create table public.delivery_work_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  execution_version_id uuid not null references public.execution_versions(id) on delete cascade,
  item_code text not null,
  title text not null,
  item_type text not null default 'Task',
  iteration_code text not null default '',
  requirement_ref text not null default '',
  wbs_ref text not null default '',
  owner_name text not null default '',
  priority text not null default 'Medium',
  status text not null default 'Backlog',
  estimate numeric not null default 0 check(estimate >= 0),
  percent_complete numeric not null default 0 check(percent_complete between 0 and 100),
  acceptance_criteria text not null default '',
  evidence text not null default '',
  blocker text not null default '',
  due_date date,
  completed_at timestamptz,
  sort_order integer not null default 0,
  unique(execution_version_id,item_code)
);

create table public.governance_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  review_code text not null,
  review_type text not null default 'Stage gate',
  title text not null,
  owner_name text not null default '',
  scheduled_date date,
  criteria text not null default '',
  evidence text not null default '',
  recommendation text not null default '',
  status text not null default 'draft' check(status in ('draft','scheduled','ready','approved','rejected','deferred','closed')),
  decision_comments text not null default '',
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,review_code)
);

create table public.governance_review_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  review_id uuid not null references public.governance_reviews(id) on delete cascade,
  from_status text,
  to_status text not null,
  comments text not null default '',
  snapshot jsonb not null,
  actor_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.project_status_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  report_date date not null,
  period_start date,
  period_end date,
  overall_health text not null,
  content jsonb not null,
  metrics jsonb not null,
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now(),
  unique(project_id,report_date)
);

create index execution_versions_project_idx on public.execution_versions(project_id,version desc);
create index delivery_iterations_project_idx on public.delivery_iterations(project_id,status);
create index delivery_work_items_project_idx on public.delivery_work_items(project_id,status);
create index governance_reviews_project_idx on public.governance_reviews(project_id,status);
create index project_status_reports_project_idx on public.project_status_reports(project_id,report_date desc);

create trigger protect_execution_versions before update or delete on public.execution_versions for each row execute function public.protect_approved_planning_records();
create trigger protect_delivery_iterations before update or delete on public.delivery_iterations for each row execute function public.protect_approved_planning_records();
create trigger protect_delivery_work_items before update or delete on public.delivery_work_items for each row execute function public.protect_approved_planning_records();
create trigger protect_governance_review_history before update or delete on public.governance_review_history for each row execute function public.protect_approved_planning_records();
create trigger protect_project_status_reports before update or delete on public.project_status_reports for each row execute function public.protect_approved_planning_records();

create or replace function public.save_execution_control(target_project uuid, expected_version integer, setting_content jsonb, iteration_items jsonb, work_items jsonb, review_items jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare target_workspace uuid; actor_role public.workspace_role; control public.execution_control_sets; next_version integer; version_id uuid; item jsonb; review_id uuid;
begin
  if jsonb_typeof(coalesce(setting_content,'{}')) <> 'object' or jsonb_typeof(coalesce(iteration_items,'[]')) <> 'array' or jsonb_typeof(coalesce(work_items,'[]')) <> 'array' or jsonb_typeof(coalesce(review_items,'[]')) <> 'array' then raise exception 'Invalid execution payload'; end if;
  select workspace_id into target_workspace from public.projects where id=target_project;
  actor_role:=public.workspace_role_for(target_workspace);
  if target_workspace is null or actor_role not in ('owner','admin','project_manager') then raise exception 'Project manager permission required'; end if;
  select * into control from public.execution_control_sets where project_id=target_project for update;
  if control.id is null then
    if expected_version not in (0,1) then raise exception 'Execution version conflict'; end if;
    insert into public.execution_control_sets(workspace_id,project_id,settings,created_by,updated_by) values(target_workspace,target_project,setting_content,auth.uid(),auth.uid()) returning * into control;
  elsif control.current_version<>expected_version then raise exception 'Execution version conflict';
  end if;
  next_version:=control.current_version+1;
  insert into public.execution_versions(workspace_id,project_id,execution_set_id,version,settings,created_by) values(target_workspace,target_project,control.id,next_version,setting_content,auth.uid()) returning id into version_id;
  for item in select value from jsonb_array_elements(iteration_items) loop
    insert into public.delivery_iterations(workspace_id,project_id,execution_version_id,iteration_code,name,iteration_type,goal,start_date,end_date,status,capacity,planned_points,completed_points,review_outcome,retrospective,sort_order)
    values(target_workspace,target_project,version_id,item->>'code',item->>'name',coalesce(item->>'type','Sprint'),coalesce(item->>'goal',''),nullif(item->>'startDate','')::date,nullif(item->>'endDate','')::date,coalesce(item->>'status','Planned'),coalesce(nullif(item->>'capacity','')::numeric,0),coalesce(nullif(item->>'plannedPoints','')::numeric,0),coalesce(nullif(item->>'completedPoints','')::numeric,0),coalesce(item->>'reviewOutcome',''),coalesce(item->>'retrospective',''),coalesce(nullif(item->>'sortOrder','')::integer,0));
  end loop;
  for item in select value from jsonb_array_elements(work_items) loop
    if nullif(item->>'iterationCode','') is not null and not exists(select 1 from public.delivery_iterations where execution_version_id=version_id and iteration_code=item->>'iterationCode') then raise exception 'Work item references an unknown iteration'; end if;
    insert into public.delivery_work_items(workspace_id,project_id,execution_version_id,item_code,title,item_type,iteration_code,requirement_ref,wbs_ref,owner_name,priority,status,estimate,percent_complete,acceptance_criteria,evidence,blocker,due_date,completed_at,sort_order)
    values(target_workspace,target_project,version_id,item->>'code',item->>'title',coalesce(item->>'type','Task'),coalesce(item->>'iterationCode',''),coalesce(item->>'requirement',''),coalesce(item->>'wbs',''),coalesce(item->>'owner',''),coalesce(item->>'priority','Medium'),coalesce(item->>'status','Backlog'),coalesce(nullif(item->>'estimate','')::numeric,0),greatest(0,least(100,coalesce(nullif(item->>'percentComplete','')::numeric,0))),coalesce(item->>'acceptanceCriteria',''),coalesce(item->>'evidence',''),coalesce(item->>'blocker',''),nullif(item->>'dueDate','')::date,case when coalesce(item->>'status','')='Done' then coalesce(nullif(item->>'completedAt','')::timestamptz,now()) else null end,coalesce(nullif(item->>'sortOrder','')::integer,0));
  end loop;
  delete from public.governance_reviews review where review.project_id=target_project and review.status='draft' and not exists(select 1 from jsonb_array_elements(review_items) payload where nullif(payload->>'id','')::uuid=review.id);
  for item in select value from jsonb_array_elements(review_items) loop
    review_id:=coalesce(nullif(item->>'id','')::uuid,gen_random_uuid());
    if exists(select 1 from public.governance_reviews where id=review_id) then
      update public.governance_reviews set review_code=item->>'code',review_type=coalesce(item->>'type','Stage gate'),title=item->>'title',owner_name=coalesce(item->>'owner',''),scheduled_date=nullif(item->>'scheduledDate','')::date,criteria=coalesce(item->>'criteria',''),evidence=coalesce(item->>'evidence',''),recommendation=coalesce(item->>'recommendation',''),updated_by=auth.uid(),updated_at=now() where id=review_id and project_id=target_project and status in ('draft','scheduled','ready');
    else
      insert into public.governance_reviews(id,workspace_id,project_id,review_code,review_type,title,owner_name,scheduled_date,criteria,evidence,recommendation,created_by,updated_by) values(review_id,target_workspace,target_project,item->>'code',coalesce(item->>'type','Stage gate'),item->>'title',coalesce(item->>'owner',''),nullif(item->>'scheduledDate','')::date,coalesce(item->>'criteria',''),coalesce(item->>'evidence',''),coalesce(item->>'recommendation',''),auth.uid(),auth.uid());
      insert into public.governance_review_history(workspace_id,project_id,review_id,to_status,comments,snapshot,actor_user_id) values(target_workspace,target_project,review_id,'draft','Created',item,auth.uid());
    end if;
  end loop;
  update public.execution_control_sets set current_version=next_version,settings=setting_content,updated_by=auth.uid(),updated_at=now() where id=control.id;
  insert into public.audit_events(workspace_id,project_id,actor_user_id,action,entity_type,entity_id,metadata) values(target_workspace,target_project,auth.uid(),'saved','execution_control',control.id::text,jsonb_build_object('version',next_version,'iterations',jsonb_array_length(iteration_items),'work_items',jsonb_array_length(work_items)));
  return jsonb_build_object('version',next_version);
end $$;

create or replace function public.transition_governance_review(target_review uuid, next_status text, transition_comments text default '') returns jsonb language plpgsql security definer set search_path=public as $$
declare review public.governance_reviews; actor_role public.workspace_role; allowed boolean:=false;
begin
  select * into review from public.governance_reviews where id=target_review for update;
  if review.id is null then raise exception 'Governance review not found'; end if;
  actor_role:=public.workspace_role_for(review.workspace_id);
  if actor_role not in ('owner','admin','project_manager') then raise exception 'Project manager permission required'; end if;
  if review.status='draft' and next_status='scheduled' then allowed:=true;
  elsif review.status='scheduled' and next_status='ready' then allowed:=true;
  elsif review.status='deferred' and next_status='ready' then allowed:=true;
  elsif review.status='ready' and next_status in ('approved','rejected','deferred') and actor_role in ('owner','admin') then allowed:=true;
  elsif review.status='approved' and next_status='closed' then allowed:=true;
  end if;
  if not allowed then raise exception 'Governance transition not permitted'; end if;
  insert into public.governance_review_history(workspace_id,project_id,review_id,from_status,to_status,comments,snapshot,actor_user_id) values(review.workspace_id,review.project_id,review.id,review.status,next_status,coalesce(transition_comments,''),to_jsonb(review),auth.uid());
  update public.governance_reviews set status=next_status,decision_comments=case when next_status in ('approved','rejected','deferred') then coalesce(transition_comments,'') else decision_comments end,decided_by=case when next_status in ('approved','rejected','deferred') then auth.uid() else decided_by end,decided_at=case when next_status in ('approved','rejected','deferred') then now() else decided_at end,updated_by=auth.uid(),updated_at=now() where id=review.id;
  insert into public.audit_events(workspace_id,project_id,actor_user_id,action,entity_type,entity_id,metadata) values(review.workspace_id,review.project_id,auth.uid(),'transitioned','governance_review',review.id::text,jsonb_build_object('from',review.status,'to',next_status,'comments',coalesce(transition_comments,'')));
  return jsonb_build_object('id',review.id,'status',next_status);
end $$;

create or replace function public.publish_status_report(target_project uuid, report_payload jsonb, metric_snapshot jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare target_workspace uuid; actor_role public.workspace_role; report_id uuid;
begin
  if jsonb_typeof(coalesce(report_payload,'{}'))<>'object' or jsonb_typeof(coalesce(metric_snapshot,'{}'))<>'object' then raise exception 'Invalid report payload'; end if;
  select workspace_id into target_workspace from public.projects where id=target_project;
  actor_role:=public.workspace_role_for(target_workspace);
  if target_workspace is null or actor_role not in ('owner','admin','project_manager') then raise exception 'Project manager permission required'; end if;
  if nullif(report_payload->>'date','') is null or nullif(report_payload->>'health','') is null then raise exception 'Report date and health are required'; end if;
  insert into public.project_status_reports(workspace_id,project_id,report_date,period_start,period_end,overall_health,content,metrics,published_by)
  values(target_workspace,target_project,(report_payload->>'date')::date,nullif(report_payload->>'periodStart','')::date,nullif(report_payload->>'periodEnd','')::date,report_payload->>'health',report_payload,metric_snapshot,auth.uid()) returning id into report_id;
  insert into public.audit_events(workspace_id,project_id,actor_user_id,action,entity_type,entity_id,metadata) values(target_workspace,target_project,auth.uid(),'published','status_report',report_id::text,jsonb_build_object('report_date',report_payload->>'date','health',report_payload->>'health'));
  return report_id;
end $$;

alter table public.execution_control_sets enable row level security;
alter table public.execution_versions enable row level security;
alter table public.delivery_iterations enable row level security;
alter table public.delivery_work_items enable row level security;
alter table public.governance_reviews enable row level security;
alter table public.governance_review_history enable row level security;
alter table public.project_status_reports enable row level security;

create policy execution_control_sets_member_read on public.execution_control_sets for select to authenticated using(public.is_workspace_member(workspace_id));
create policy execution_versions_member_read on public.execution_versions for select to authenticated using(public.is_workspace_member(workspace_id));
create policy delivery_iterations_member_read on public.delivery_iterations for select to authenticated using(public.is_workspace_member(workspace_id));
create policy delivery_work_items_member_read on public.delivery_work_items for select to authenticated using(public.is_workspace_member(workspace_id));
create policy governance_reviews_member_read on public.governance_reviews for select to authenticated using(public.is_workspace_member(workspace_id));
create policy governance_review_history_member_read on public.governance_review_history for select to authenticated using(public.is_workspace_member(workspace_id));
create policy project_status_reports_member_read on public.project_status_reports for select to authenticated using(public.is_workspace_member(workspace_id));

grant select on public.execution_control_sets,public.execution_versions,public.delivery_iterations,public.delivery_work_items,public.governance_reviews,public.governance_review_history,public.project_status_reports to authenticated;
grant select on public.execution_control_sets,public.execution_versions,public.delivery_iterations,public.delivery_work_items,public.governance_reviews,public.project_status_reports,public.project_control_sets,public.project_risks,public.project_issues,public.change_requests,public.core_planning_sets,public.core_planning_versions,public.project_requirements,public.requirement_traces,public.wbs_nodes,public.schedule_control_sets,public.schedule_versions,public.schedule_tasks,public.schedule_dependencies,public.cost_control_sets,public.cost_versions,public.cost_items,public.cash_flow_entries to service_role;
revoke insert,update,delete on public.execution_control_sets,public.execution_versions,public.delivery_iterations,public.delivery_work_items,public.governance_reviews,public.governance_review_history,public.project_status_reports from authenticated;
revoke all on function public.save_execution_control(uuid,integer,jsonb,jsonb,jsonb,jsonb),public.transition_governance_review(uuid,text,text),public.publish_status_report(uuid,jsonb,jsonb) from public;
grant execute on function public.save_execution_control(uuid,integer,jsonb,jsonb,jsonb,jsonb),public.transition_governance_review(uuid,text,text),public.publish_status_report(uuid,jsonb,jsonb) to authenticated;

commit;
