begin;

-- A person may participate in more than one tenant. The previous invitation
-- function rejected an otherwise valid invite whenever the account already
-- belonged to any other workspace, making established users unable to join a
-- new project workspace.
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
  if signed_in_email='' or signed_in_email<>matched.email then
    raise exception 'Invitation email does not match the signed-in account';
  end if;

  insert into public.workspace_members(workspace_id,user_id,role)
  values(matched.workspace_id,auth.uid(),matched.role)
  on conflict(workspace_id,user_id) do update set role=excluded.role;

  update public.workspace_invitations
  set accepted_at=now(),accepted_by=auth.uid()
  where id=matched.id;

  insert into public.audit_events(workspace_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(matched.workspace_id,auth.uid(),'accepted','workspace_invitation',matched.id::text,jsonb_build_object('role',matched.role));

  return matched.workspace_id;
end $$;

revoke all on function public.accept_workspace_invitation(text) from public;
grant execute on function public.accept_workspace_invitation(text) to authenticated;

commit;
