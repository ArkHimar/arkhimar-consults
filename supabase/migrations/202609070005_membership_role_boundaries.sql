begin;

drop policy if exists members_admin_insert on public.workspace_members;
drop policy if exists members_admin_update on public.workspace_members;
drop policy if exists members_admin_delete on public.workspace_members;

create policy members_admin_insert
on public.workspace_members
for insert
to authenticated
with check (
  (
    public.workspace_role_for(workspace_id) = 'owner'
    and role in ('admin','project_manager','member','viewer')
  )
  or
  (
    public.workspace_role_for(workspace_id) = 'admin'
    and role in ('project_manager','member','viewer')
  )
);

create policy members_admin_update
on public.workspace_members
for update
to authenticated
using (
  user_id <> auth.uid()
  and (
    public.workspace_role_for(workspace_id) = 'owner'
    or (
      public.workspace_role_for(workspace_id) = 'admin'
      and role in ('project_manager','member','viewer')
    )
  )
)
with check (
  user_id <> auth.uid()
  and (
    (
      public.workspace_role_for(workspace_id) = 'owner'
      and role in ('admin','project_manager','member','viewer')
    )
    or
    (
      public.workspace_role_for(workspace_id) = 'admin'
      and role in ('project_manager','member','viewer')
    )
  )
);

create policy members_admin_delete
on public.workspace_members
for delete
to authenticated
using (
  user_id <> auth.uid()
  and (
    public.workspace_role_for(workspace_id) = 'owner'
    or (
      public.workspace_role_for(workspace_id) = 'admin'
      and role in ('project_manager','member','viewer')
    )
  )
);

commit;
