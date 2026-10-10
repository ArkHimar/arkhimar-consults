begin;

-- A narrow service-only entry point for the authenticated invitation API.
-- The function validates the invitation, user email and account limit before
-- performing the membership write; the service role receives no direct write
-- privilege on workspace_members.
create or replace function public.accept_workspace_invitation_service(
  invite_token text,
  accepting_user uuid,
  accepting_email text
)
returns uuid
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  matched public.workspace_invitations;
  normalized_email text := lower(trim(coalesce(accepting_email,'')));
  membership_count integer;
  unlimited_emails constant text[] := array['emavericks22@gmail.com','projects@arkhimar.com'];
begin
  if accepting_user is null then raise exception 'Authentication required'; end if;
  if invite_token is null or char_length(invite_token) not between 40 and 200 then raise exception 'Invalid invitation'; end if;

  select * into matched
  from public.workspace_invitations
  where token_hash=encode(digest(invite_token,'sha256'),'hex')
    and accepted_at is null
    and revoked_at is null
    and expires_at>now()
  for update;

  if matched.id is null then raise exception 'Invitation is invalid or expired'; end if;
  if normalized_email='' or normalized_email<>matched.email then
    raise exception 'Invitation email does not match the signed-in account';
  end if;

  if not (normalized_email=any(unlimited_emails)) then
    select count(*) into membership_count from public.workspace_members where user_id=accepting_user;
    if membership_count>=2 and not exists(
      select 1 from public.workspace_members where workspace_id=matched.workspace_id and user_id=accepting_user
    ) then
      raise exception 'This account has reached the two-workspace invitation limit';
    end if;
  end if;

  insert into public.workspace_members(workspace_id,user_id,role)
  values(matched.workspace_id,accepting_user,matched.role)
  on conflict(workspace_id,user_id) do update set role=excluded.role;

  update public.workspace_invitations set accepted_at=now(),accepted_by=accepting_user where id=matched.id;
  insert into public.audit_events(workspace_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(matched.workspace_id,accepting_user,'accepted','workspace_invitation',matched.id::text,jsonb_build_object('role',matched.role,'service_acceptance',true,'unlimited_invites',normalized_email=any(unlimited_emails)));
  return matched.workspace_id;
end $$;

revoke all on function public.accept_workspace_invitation_service(text,uuid,text) from public;
grant execute on function public.accept_workspace_invitation_service(text,uuid,text) to service_role;

commit;
