begin;

-- Keep initiation transitions retry-safe. A slow or double click must not turn a
-- successful transition into a misleading failure, and edit/approval decisions
-- must use the workspace's effective permission matrix.
create or replace function public.transition_business_case(target_project uuid,expected_version integer,next_status text,decision_comments text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  artifact public.business_cases;
  artifact_version public.business_case_versions;
  next_version integer;
  option_count integer;
  can_edit boolean;
  can_approve boolean;
begin
  select * into artifact from public.business_cases where project_id=target_project for update;
  if artifact.id is null or artifact.current_version<>expected_version then raise exception 'Business case version conflict'; end if;
  can_edit:=public.workspace_has_permission(artifact.workspace_id,'edit');
  can_approve:=public.workspace_has_permission(artifact.workspace_id,'approve');
  select * into artifact_version from public.business_case_versions where business_case_id=artifact.id and version=artifact.current_version for update;

  if artifact.status=next_status then
    if (next_status in ('draft','in_review') and can_edit) or (next_status in ('changes_requested','approved') and can_approve) then
      return jsonb_build_object('id',artifact.id,'version',artifact.current_version,'status',artifact.status);
    end if;
    raise exception 'Permission required for this business case decision';
  elsif next_status='in_review' and artifact.status in ('draft','changes_requested') and can_edit then
    if nullif(trim(artifact_version.content->>'executiveSummary'),'') is null then raise exception 'Executive summary is required'; end if;
    select count(*) into option_count from public.business_case_options where business_case_version_id=artifact_version.id;
    if option_count<2 then raise exception 'At least two options are required'; end if;
    update public.business_case_versions set status='in_review',submitted_by=auth.uid(),submitted_at=now(),updated_at=now() where id=artifact_version.id;
  elsif next_status='changes_requested' and artifact.status='in_review' and can_approve then
    if nullif(trim(decision_comments),'') is null then raise exception 'Decision comments are required'; end if;
    update public.business_case_versions set status='changes_requested',updated_at=now() where id=artifact_version.id;
  elsif next_status='approved' and artifact.status='in_review' and can_approve then
    update public.business_case_versions set status='approved',approved_by=auth.uid(),approved_at=now(),updated_at=now() where id=artifact_version.id;
  elsif next_status='draft' and artifact.status='approved' and can_edit then
    update public.business_case_versions set status='superseded',updated_at=now() where id=artifact_version.id;
    next_version:=artifact.current_version+1;
    insert into public.business_case_versions(workspace_id,project_id,business_case_id,version,status,content,created_by)
      values(artifact.workspace_id,artifact.project_id,artifact.id,next_version,'draft',artifact_version.content,auth.uid()) returning * into artifact_version;
    insert into public.business_case_options(workspace_id,project_id,business_case_version_id,title,description,benefits,drawbacks,risk_summary,estimated_cost,estimated_duration_months,criteria_scores,weighted_score,sort_order)
      select workspace_id,project_id,artifact_version.id,title,description,benefits,drawbacks,risk_summary,estimated_cost,estimated_duration_months,criteria_scores,weighted_score,sort_order
      from public.business_case_options where business_case_version_id=(select id from public.business_case_versions where business_case_id=artifact.id and version=expected_version);
    update public.business_cases set current_version=next_version where id=artifact.id;
  else
    raise exception 'Business case cannot move from % to % with the current permissions',artifact.status,next_status;
  end if;

  update public.business_cases set status=next_status,updated_by=auth.uid(),updated_at=now() where id=artifact.id returning * into artifact;
  insert into public.business_case_decisions(workspace_id,project_id,business_case_id,version,decision,comments,decided_by)
    values(artifact.workspace_id,artifact.project_id,artifact.id,artifact.current_version,case when next_status='in_review' then 'submitted' when next_status='draft' then 'revision_started' else next_status end,coalesce(decision_comments,''),auth.uid());
  insert into public.audit_events(workspace_id,project_id,actor_user_id,action,entity_type,entity_id,metadata)
    values(artifact.workspace_id,artifact.project_id,auth.uid(),next_status,'business_case',artifact.id::text,jsonb_build_object('version',artifact.current_version));
  return jsonb_build_object('id',artifact.id,'version',artifact.current_version,'status',artifact.status);
end $$;

create or replace function public.transition_project_charter(target_project uuid,expected_version integer,next_status text,decision_comments text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  artifact public.project_charters;
  artifact_version public.project_charter_versions;
  next_version integer;
  updated_project_version integer;
  can_edit boolean;
  can_approve boolean;
begin
  select * into artifact from public.project_charters where project_id=target_project for update;
  if artifact.id is null or artifact.current_version<>expected_version then raise exception 'Charter version conflict'; end if;
  can_edit:=public.workspace_has_permission(artifact.workspace_id,'edit');
  can_approve:=public.workspace_has_permission(artifact.workspace_id,'approve');
  select * into artifact_version from public.project_charter_versions where charter_id=artifact.id and version=artifact.current_version for update;

  if artifact.status=next_status then
    if (next_status in ('draft','in_review') and can_edit) or (next_status in ('changes_requested','approved') and can_approve) then
      select version into updated_project_version from public.projects where id=artifact.project_id;
      return jsonb_build_object('id',artifact.id,'version',artifact.current_version,'status',artifact.status,'projectVersion',updated_project_version);
    end if;
    raise exception 'Permission required for this charter decision';
  elsif next_status='in_review' and artifact.status in ('draft','changes_requested') and can_edit then
    if nullif(trim(artifact_version.content->>'purpose'),'') is null then raise exception 'Purpose and justification are required'; end if;
    update public.project_charter_versions set status='in_review',submitted_by=auth.uid(),submitted_at=now(),updated_at=now() where id=artifact_version.id;
  elsif next_status='changes_requested' and artifact.status='in_review' and can_approve then
    if nullif(trim(decision_comments),'') is null then raise exception 'Decision comments are required'; end if;
    update public.project_charter_versions set status='changes_requested',updated_at=now() where id=artifact_version.id;
  elsif next_status='approved' and artifact.status='in_review' and can_approve then
    update public.project_charter_versions set status='approved',approved_by=auth.uid(),approved_at=now(),updated_at=now() where id=artifact_version.id;
    update public.projects set data=jsonb_set(data,'{status}','"Authorized"'::jsonb,true) where id=artifact.project_id returning version into updated_project_version;
  elsif next_status='draft' and artifact.status='approved' and can_edit then
    update public.project_charter_versions set status='superseded',updated_at=now() where id=artifact_version.id;
    next_version:=artifact.current_version+1;
    insert into public.project_charter_versions(workspace_id,project_id,charter_id,version,status,content,created_by)
      values(artifact.workspace_id,artifact.project_id,artifact.id,next_version,'draft',artifact_version.content,auth.uid());
    update public.project_charters set current_version=next_version where id=artifact.id;
  else
    raise exception 'Charter cannot move from % to % with the current permissions',artifact.status,next_status;
  end if;

  update public.project_charters set status=next_status,updated_by=auth.uid(),updated_at=now() where id=artifact.id returning * into artifact;
  insert into public.project_charter_decisions(workspace_id,project_id,charter_id,version,decision,comments,decided_by)
    values(artifact.workspace_id,artifact.project_id,artifact.id,artifact.current_version,case when next_status='in_review' then 'submitted' when next_status='draft' then 'revision_started' else next_status end,coalesce(decision_comments,''),auth.uid());
  insert into public.audit_events(workspace_id,project_id,actor_user_id,action,entity_type,entity_id,metadata)
    values(artifact.workspace_id,artifact.project_id,auth.uid(),next_status,'project_charter',artifact.id::text,jsonb_build_object('version',artifact.current_version));
  if updated_project_version is null then select version into updated_project_version from public.projects where id=artifact.project_id; end if;
  return jsonb_build_object('id',artifact.id,'version',artifact.current_version,'status',artifact.status,'projectVersion',updated_project_version);
end $$;

revoke all on function public.transition_business_case(uuid,integer,text,text),public.transition_project_charter(uuid,integer,text,text) from public;
grant execute on function public.transition_business_case(uuid,integer,text,text),public.transition_project_charter(uuid,integer,text,text) to authenticated;

notify pgrst, 'reload schema';

commit;
