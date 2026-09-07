begin;

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (email=lower(email) and char_length(email) between 3 and 254),
  role public.workspace_role not null check (role<>'owner'),
  token_hash text not null unique check (char_length(token_hash)=64),
  invited_by uuid not null references auth.users(id),
  delivery_status text not null default 'queued' check (delivery_status in ('queued','sent','failed')),
  delivery_error text,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at>created_at),
  check ((accepted_at is null and accepted_by is null) or (accepted_at is not null and accepted_by is not null))
);

create index workspace_invitations_workspace_idx on public.workspace_invitations(workspace_id,created_at desc);
create index workspace_invitations_email_idx on public.workspace_invitations(email,expires_at desc);

alter table public.workspace_invitations enable row level security;

create policy invitations_admin_read
on public.workspace_invitations
for select
to authenticated
using (public.workspace_role_for(workspace_id) in ('owner','admin'));

grant select on table public.workspace_invitations to authenticated;
grant select,insert,update,delete on table public.workspace_invitations to service_role;

create or replace function public.accept_workspace_invitation(invite_token text)
returns uuid
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  matched public.workspace_invitations;
  signed_in_email text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if invite_token is null or char_length(invite_token) not between 40 and 200 then raise exception 'Invalid invitation'; end if;
  signed_in_email := lower(coalesce(auth.jwt()->>'email',''));
  select * into matched
  from public.workspace_invitations
  where token_hash=encode(digest(invite_token,'sha256'),'hex')
    and accepted_at is null
    and revoked_at is null
    and expires_at>now()
  for update;
  if matched.id is null then raise exception 'Invitation is invalid or expired'; end if;
  if signed_in_email='' or signed_in_email<>matched.email then raise exception 'Invitation email does not match the signed-in account'; end if;
  if exists(select 1 from public.workspace_members where user_id=auth.uid() and workspace_id<>matched.workspace_id) then
    raise exception 'This account already belongs to another workspace';
  end if;
  insert into public.workspace_members(workspace_id,user_id,role)
  values(matched.workspace_id,auth.uid(),matched.role)
  on conflict(workspace_id,user_id) do nothing;
  update public.workspace_invitations set accepted_at=now(),accepted_by=auth.uid() where id=matched.id;
  insert into public.audit_events(workspace_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(matched.workspace_id,auth.uid(),'accepted','workspace_invitation',matched.id::text,jsonb_build_object('role',matched.role));
  return matched.workspace_id;
end $$;

revoke all on function public.accept_workspace_invitation(text) from public;
grant execute on function public.accept_workspace_invitation(text) to authenticated;

commit;
