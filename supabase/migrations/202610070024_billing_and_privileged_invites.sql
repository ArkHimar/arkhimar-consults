begin;

-- ArkHimar operational accounts may participate in any number of client
-- workspaces. Other accounts keep the existing two-workspace beta boundary.
create or replace function public.accept_workspace_invitation(invite_token text)
returns uuid
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  matched public.workspace_invitations;
  signed_in_email text;
  membership_count integer;
  unlimited_emails constant text[] := array['emavericks22@gmail.com','projects@arkhimar.com'];
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

  if not (signed_in_email=any(unlimited_emails)) then
    select count(*) into membership_count from public.workspace_members where user_id=auth.uid();
    if membership_count>=2 and not exists(
      select 1 from public.workspace_members where workspace_id=matched.workspace_id and user_id=auth.uid()
    ) then
      raise exception 'This account has reached the two-workspace invitation limit';
    end if;
  end if;

  insert into public.workspace_members(workspace_id,user_id,role)
  values(matched.workspace_id,auth.uid(),matched.role)
  on conflict(workspace_id,user_id) do update set role=excluded.role;

  update public.workspace_invitations set accepted_at=now(),accepted_by=auth.uid() where id=matched.id;
  insert into public.audit_events(workspace_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(matched.workspace_id,auth.uid(),'accepted','workspace_invitation',matched.id::text,jsonb_build_object('role',matched.role,'unlimited_invites',signed_in_email=any(unlimited_emails)));
  return matched.workspace_id;
end $$;

revoke all on function public.accept_workspace_invitation(text) from public;
grant execute on function public.accept_workspace_invitation(text) to authenticated;

create table public.billing_plan_variants (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'paystack' check (provider='paystack'),
  plan text not null check (plan in ('growth','professional')),
  billing_period text not null check (billing_period in ('monthly','annual')),
  seats integer not null check (seats between 1 and 500),
  currency text not null check (currency in ('USD','NGN')),
  amount_subunit bigint not null check (amount_subunit>0),
  provider_plan_code text not null unique,
  created_at timestamptz not null default now(),
  unique(provider,plan,billing_period,seats,currency,amount_subunit)
);

create table public.billing_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  plan text not null check (plan in ('free','growth','professional','enterprise')),
  billing_period text not null check (billing_period in ('monthly','annual')),
  seats integer not null check (seats between 1 and 500),
  currency text not null check (currency in ('USD','NGN')),
  amount_subunit bigint not null check (amount_subunit>=0),
  provider text not null default 'paystack' check (provider in ('paystack','none')),
  provider_reference text unique,
  provider_plan_code text,
  status text not null default 'initialized' check (status in ('initialized','pending','successful','failed','abandoned','contact_required')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.workspace_subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','growth','professional','enterprise')),
  billing_period text not null default 'monthly' check (billing_period in ('monthly','annual')),
  seats integer not null default 1 check (seats between 1 and 500),
  status text not null default 'active' check (status in ('active','trialing','past_due','non_renewing','cancelled','contact_required')),
  provider text not null default 'none' check (provider in ('paystack','none')),
  provider_customer_code text,
  provider_subscription_code text,
  provider_email_token text,
  provider_plan_code text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index billing_checkout_workspace_idx on public.billing_checkout_sessions(workspace_id,created_at desc);
create index billing_checkout_reference_idx on public.billing_checkout_sessions(provider_reference);

alter table public.billing_plan_variants enable row level security;
alter table public.billing_checkout_sessions enable row level security;
alter table public.workspace_subscriptions enable row level security;

create policy billing_checkout_member_read on public.billing_checkout_sessions for select to authenticated
using (exists(select 1 from public.workspace_members m where m.workspace_id=billing_checkout_sessions.workspace_id and m.user_id=auth.uid()));
create policy workspace_subscription_member_read on public.workspace_subscriptions for select to authenticated
using (exists(select 1 from public.workspace_members m where m.workspace_id=workspace_subscriptions.workspace_id and m.user_id=auth.uid()));

grant select on public.billing_checkout_sessions,public.workspace_subscriptions to authenticated;
grant select,insert,update,delete on public.billing_plan_variants,public.billing_checkout_sessions,public.workspace_subscriptions to service_role;

commit;
