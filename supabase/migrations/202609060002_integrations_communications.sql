begin;

create table public.workspace_brand_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  sender_name text not null default 'ArkHimar PM' check (char_length(sender_name) between 2 and 120),
  reply_to text,
  primary_color text not null default '#191916' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text not null default '#B86B42' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  background_color text not null default '#F5F3ED' check (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_path text,
  letterhead_path text,
  footer_text text not null default 'Generated with ArkHimar PM' check (char_length(footer_text) <= 500),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  kind text not null check (kind in ('email','letter','form')),
  subject text not null default '' check (char_length(subject) <= 200),
  blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks)='array'),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(workspace_id,name,kind)
);

create table public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid,
  template_id uuid references public.message_templates(id) on delete set null,
  channel text not null default 'email' check (channel='email'),
  recipients jsonb not null check (jsonb_typeof(recipients)='array'),
  subject text not null check (char_length(subject) between 1 and 200),
  blocks jsonb not null check (jsonb_typeof(blocks)='array'),
  attachment_ids uuid[] not null default '{}',
  status text not null check (status in ('queued','sent','failed')),
  provider text not null default 'resend',
  provider_message_id text,
  error_message text,
  idempotency_key uuid not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  foreign key(project_id,workspace_id) references public.projects(id,workspace_id) on delete set null (project_id)
);

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  label text not null check (char_length(label) between 2 and 100),
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default array['forms:submit'],
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  usage_count bigint not null default 0,
  revoked_at timestamptz,
  check (scopes <@ array['forms:submit','messages:send','submissions:read']::text[])
);

create table public.api_request_log (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  api_key_id uuid not null references public.api_keys(id) on delete cascade,
  scope text not null,
  ip_hash text,
  occurred_at timestamptz not null default now()
);

create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid,
  api_key_id uuid references public.api_keys(id) on delete set null,
  form_id text not null check (char_length(form_id) between 1 and 100),
  submitter_name text,
  submitter_email text,
  submitter_phone text,
  message text,
  fields jsonb not null default '{}'::jsonb check (jsonb_typeof(fields)='object'),
  source text not null default 'api',
  received_at timestamptz not null default now(),
  foreign key(project_id,workspace_id) references public.projects(id,workspace_id) on delete set null (project_id)
);

create index message_templates_workspace_idx on public.message_templates(workspace_id,updated_at desc) where archived_at is null;
create index outbound_messages_workspace_idx on public.outbound_messages(workspace_id,created_at desc);
create index api_keys_workspace_idx on public.api_keys(workspace_id,created_at desc);
create index api_request_rate_idx on public.api_request_log(api_key_id,occurred_at desc);
create index form_submissions_workspace_idx on public.form_submissions(workspace_id,received_at desc);

create or replace function public.create_workspace_api_key(target_workspace uuid,key_label text,key_scopes text[] default array['forms:submit'])
returns table(id uuid,api_key text,key_prefix text) language plpgsql security definer set search_path=public,extensions as $$
declare secret text; created_id uuid;
begin
  if public.workspace_role_for(target_workspace) not in ('owner','admin') then raise exception 'Workspace admin permission required'; end if;
  if char_length(trim(key_label)) not between 2 and 100 then raise exception 'Key label must be 2–100 characters'; end if;
  if key_scopes is null or not (key_scopes <@ array['forms:submit','messages:send','submissions:read']::text[]) then raise exception 'Invalid API key scope'; end if;
  secret := 'akh_live_'||encode(gen_random_bytes(32),'hex');
  insert into public.api_keys(workspace_id,label,key_prefix,key_hash,scopes,created_by)
  values(target_workspace,trim(key_label),left(secret,17),encode(digest(secret,'sha256'),'hex'),key_scopes,auth.uid()) returning api_keys.id into created_id;
  insert into public.audit_events(workspace_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(target_workspace,auth.uid(),'created','api_key',created_id::text,jsonb_build_object('label',trim(key_label),'key_prefix',left(secret,17),'scopes',key_scopes));
  return query select created_id,secret,left(secret,17);
end $$;

create or replace function public.list_workspace_api_keys(target_workspace uuid)
returns table(id uuid,label text,key_prefix text,scopes text[],created_at timestamptz,last_used_at timestamptz,usage_count bigint,revoked_at timestamptz)
language sql stable security definer set search_path=public as $$
  select k.id,k.label,k.key_prefix,k.scopes,k.created_at,k.last_used_at,k.usage_count,k.revoked_at
  from public.api_keys k
  where k.workspace_id=target_workspace and public.workspace_role_for(target_workspace) in ('owner','admin')
  order by k.created_at desc
$$;

create or replace function public.revoke_workspace_api_key(target_key uuid)
returns void language plpgsql security definer set search_path=public as $$
declare target_workspace uuid;
begin
  select workspace_id into target_workspace from public.api_keys where id=target_key;
  if target_workspace is null or public.workspace_role_for(target_workspace) not in ('owner','admin') then raise exception 'Workspace admin permission required'; end if;
  update public.api_keys set revoked_at=coalesce(revoked_at,now()) where id=target_key;
  insert into public.audit_events(workspace_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(target_workspace,auth.uid(),'revoked','api_key',target_key::text,'{}'::jsonb);
end $$;

create or replace function public.authorize_api_key_request(request_key_hash text,request_scope text,request_ip_hash text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare matched public.api_keys; recent_count integer;
begin
  select * into matched from public.api_keys where key_hash=request_key_hash;
  if matched.id is null or matched.revoked_at is not null or (matched.expires_at is not null and matched.expires_at<=now()) or not (request_scope=any(matched.scopes)) then
    return jsonb_build_object('ok',false,'error','invalid_key');
  end if;
  select count(*) into recent_count from public.api_request_log where api_key_id=matched.id and occurred_at>now()-interval '1 minute';
  if recent_count>=60 then return jsonb_build_object('ok',false,'error','rate_limited'); end if;
  insert into public.api_request_log(workspace_id,api_key_id,scope,ip_hash) values(matched.workspace_id,matched.id,request_scope,request_ip_hash);
  update public.api_keys set last_used_at=now(),usage_count=usage_count+1 where id=matched.id;
  return jsonb_build_object('ok',true,'workspace_id',matched.workspace_id,'api_key_id',matched.id);
end $$;

revoke all on function public.create_workspace_api_key(uuid,text,text[]) from public;
revoke all on function public.list_workspace_api_keys(uuid) from public;
revoke all on function public.revoke_workspace_api_key(uuid) from public;
revoke all on function public.authorize_api_key_request(text,text,text) from public;
grant execute on function public.create_workspace_api_key(uuid,text,text[]),public.list_workspace_api_keys(uuid),public.revoke_workspace_api_key(uuid) to authenticated;
grant execute on function public.authorize_api_key_request(text,text,text) to service_role;

create or replace function public.audit_form_submission()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.audit_events(workspace_id,project_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(new.workspace_id,new.project_id,null,'received','form_submission',new.id::text,jsonb_build_object('form_id',new.form_id,'source',new.source));
  return new;
end $$;
create trigger audit_form_submissions after insert on public.form_submissions for each row execute procedure public.audit_form_submission();

alter table public.workspace_brand_settings enable row level security;
alter table public.message_templates enable row level security;
alter table public.outbound_messages enable row level security;
alter table public.api_keys enable row level security;
alter table public.api_request_log enable row level security;
alter table public.form_submissions enable row level security;

create policy brand_member_read on public.workspace_brand_settings for select to authenticated using(public.is_workspace_member(workspace_id));
create policy brand_admin_insert on public.workspace_brand_settings for insert to authenticated with check(public.workspace_role_for(workspace_id) in ('owner','admin') and updated_by=auth.uid());
create policy brand_admin_update on public.workspace_brand_settings for update to authenticated using(public.workspace_role_for(workspace_id) in ('owner','admin')) with check(public.workspace_role_for(workspace_id) in ('owner','admin') and updated_by=auth.uid());
create policy templates_member_read on public.message_templates for select to authenticated using(public.is_workspace_member(workspace_id));
create policy templates_manager_insert on public.message_templates for insert to authenticated with check(public.can_manage_workspace(workspace_id) and created_by=auth.uid());
create policy templates_manager_update on public.message_templates for update to authenticated using(public.can_manage_workspace(workspace_id)) with check(public.can_manage_workspace(workspace_id));
create policy messages_manager_read on public.outbound_messages for select to authenticated using(public.can_manage_workspace(workspace_id));
create policy submissions_manager_read on public.form_submissions for select to authenticated using(public.can_manage_workspace(workspace_id));

revoke all on public.api_keys,public.api_request_log from anon,authenticated;
revoke insert,update,delete on public.outbound_messages,public.form_submissions from authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('workspace-brand-assets','workspace-brand-assets',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy brand_assets_member_read on storage.objects for select to authenticated using (
  bucket_id='workspace-brand-assets' and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
);
create policy brand_assets_admin_insert on storage.objects for insert to authenticated with check (
  bucket_id='workspace-brand-assets' and public.workspace_role_for(((storage.foldername(name))[1])::uuid) in ('owner','admin') and owner_id=auth.uid()::text
);
create policy brand_assets_admin_update on storage.objects for update to authenticated using (
  bucket_id='workspace-brand-assets' and public.workspace_role_for(((storage.foldername(name))[1])::uuid) in ('owner','admin')
) with check (
  bucket_id='workspace-brand-assets' and public.workspace_role_for(((storage.foldername(name))[1])::uuid) in ('owner','admin')
);
create policy brand_assets_admin_delete on storage.objects for delete to authenticated using (
  bucket_id='workspace-brand-assets' and public.workspace_role_for(((storage.foldername(name))[1])::uuid) in ('owner','admin')
);

commit;
