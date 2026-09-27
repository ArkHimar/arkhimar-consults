begin;

create table if not exists public.carcare_customers (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  normalized_email text not null check (normalized_email=lower(trim(normalized_email)) and position('@' in normalized_email)>1),
  customer_id text generated always as ('CUS-'||lpad(id::text,6,'0')) stored,
  created_at timestamptz not null default now(),
  unique(workspace_id,normalized_email),
  unique(workspace_id,customer_id)
);

alter table public.carcare_customers enable row level security;
revoke all on public.carcare_customers from anon,authenticated;
grant select,insert,update on public.carcare_customers to service_role;
grant usage,select on sequence public.carcare_customers_id_seq to service_role;
grant update on public.form_submissions to service_role;

create or replace function public.resolve_carcare_customer(target_workspace uuid,customer_email text)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare normalized text:=lower(trim(customer_email)); resolved text;
begin
  if normalized='' or position('@' in normalized)<=1 then raise exception 'Valid customer email required'; end if;
  insert into public.carcare_customers(workspace_id,normalized_email)
  values(target_workspace,normalized)
  on conflict(workspace_id,normalized_email) do update set normalized_email=excluded.normalized_email
  returning customer_id into resolved;
  return resolved;
end;
$$;

create or replace function public.backfill_carcare_customer_ids(target_workspace uuid)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare changed integer:=0;
begin
  insert into public.carcare_customers(workspace_id,normalized_email,created_at)
  select target_workspace,lower(trim(submitter_email)),min(received_at)
  from public.form_submissions
  where workspace_id=target_workspace
    and form_id in ('carcare-job','carcare-feedback')
    and submitter_email is not null
    and position('@' in lower(trim(submitter_email)))>1
  group by lower(trim(submitter_email))
  order by min(received_at),lower(trim(submitter_email))
  on conflict(workspace_id,normalized_email) do nothing;

  update public.form_submissions submission
  set fields=jsonb_set(coalesce(submission.fields,'{}'::jsonb),'{customer_id}',to_jsonb(customer.customer_id),true)
  from public.carcare_customers customer
  where submission.workspace_id=target_workspace
    and submission.form_id in ('carcare-job','carcare-feedback')
    and lower(trim(submission.submitter_email))=customer.normalized_email
    and customer.workspace_id=target_workspace
    and coalesce(submission.fields->>'customer_id','')<>customer.customer_id;
  get diagnostics changed=row_count;
  return changed;
end;
$$;

revoke all on function public.resolve_carcare_customer(uuid,text) from public,anon,authenticated;
revoke all on function public.backfill_carcare_customer_ids(uuid) from public,anon,authenticated;
grant execute on function public.resolve_carcare_customer(uuid,text) to service_role;
grant execute on function public.backfill_carcare_customer_ids(uuid) to service_role;

select public.backfill_carcare_customer_ids(id)
from public.workspaces
where id in (select distinct workspace_id from public.form_submissions where form_id in ('carcare-job','carcare-feedback'));

commit;
