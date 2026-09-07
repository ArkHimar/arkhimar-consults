begin;

grant usage on schema public to service_role;

grant select on table
  public.workspace_members,
  public.projects,
  public.project_documents,
  public.audit_events,
  public.workspace_brand_settings,
  public.outbound_messages,
  public.form_submissions
to service_role;

grant insert on table
  public.audit_events,
  public.outbound_messages,
  public.form_submissions
to service_role;

grant update on table
  public.outbound_messages
to service_role;

grant usage, select on sequence public.audit_events_id_seq to service_role;

commit;
