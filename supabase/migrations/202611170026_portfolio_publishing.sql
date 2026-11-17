create table if not exists public.portfolio_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 120),
  practice text not null check (practice in ('automation','development','architecture','design')),
  summary text not null check (char_length(summary) between 10 and 1000),
  image_url text not null,
  external_url text,
  status text not null default 'Completed' check (char_length(status) between 2 and 40),
  tags text[] not null default '{}',
  published boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.portfolio_projects enable row level security;

create or replace function public.is_portfolio_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select lower(coalesce(auth.jwt()->>'email','')) in ('emavericks22@gmail.com','projects@arkhimar.com') $$;

revoke all on function public.is_portfolio_admin() from public;
grant execute on function public.is_portfolio_admin() to anon, authenticated;

create policy portfolio_projects_public_read on public.portfolio_projects
for select to anon, authenticated using (published or public.is_portfolio_admin());
create policy portfolio_projects_admin_insert on public.portfolio_projects
for insert to authenticated with check (public.is_portfolio_admin());
create policy portfolio_projects_admin_update on public.portfolio_projects
for update to authenticated using (public.is_portfolio_admin()) with check (public.is_portfolio_admin());
create policy portfolio_projects_admin_delete on public.portfolio_projects
for delete to authenticated using (public.is_portfolio_admin());

grant select on public.portfolio_projects to anon;
grant select,insert,update,delete on public.portfolio_projects to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('portfolio-assets','portfolio-assets',true,20971520,array['image/jpeg','image/png','image/webp','image/gif','image/avif'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy portfolio_assets_public_read on storage.objects for select to public using (bucket_id='portfolio-assets');
create policy portfolio_assets_admin_insert on storage.objects for insert to authenticated with check (bucket_id='portfolio-assets' and public.is_portfolio_admin());
create policy portfolio_assets_admin_update on storage.objects for update to authenticated using (bucket_id='portfolio-assets' and public.is_portfolio_admin()) with check (bucket_id='portfolio-assets' and public.is_portfolio_admin());
create policy portfolio_assets_admin_delete on storage.objects for delete to authenticated using (bucket_id='portfolio-assets' and public.is_portfolio_admin());

create or replace function public.touch_portfolio_project()
returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
drop trigger if exists portfolio_projects_touch on public.portfolio_projects;
create trigger portfolio_projects_touch before update on public.portfolio_projects for each row execute function public.touch_portfolio_project();

notify pgrst, 'reload schema';
