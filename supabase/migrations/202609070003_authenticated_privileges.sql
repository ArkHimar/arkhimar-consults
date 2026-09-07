begin;

grant usage on schema public to authenticated;

grant select on table
  public.profiles,
  public.workspaces,
  public.workspace_members,
  public.projects,
  public.project_documents,
  public.audit_events,
  public.workspace_brand_settings,
  public.message_templates,
  public.outbound_messages,
  public.form_submissions
to authenticated;

grant insert on table
  public.workspace_members,
  public.projects,
  public.project_documents,
  public.workspace_brand_settings,
  public.message_templates
to authenticated;

grant update on table
  public.profiles,
  public.workspaces,
  public.workspace_members,
  public.projects,
  public.workspace_brand_settings,
  public.message_templates
to authenticated;

grant delete on table
  public.workspace_members,
  public.projects,
  public.project_documents
to authenticated;

commit;
