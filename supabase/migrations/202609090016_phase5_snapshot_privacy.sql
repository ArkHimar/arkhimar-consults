begin;

drop policy if exists control_register_versions_member_read on public.control_register_versions;
create policy control_register_versions_manager_read on public.control_register_versions
for select to authenticated
using(public.workspace_role_for(workspace_id) in ('owner','admin','project_manager'));

commit;
