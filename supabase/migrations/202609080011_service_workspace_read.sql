begin;

-- Server document and invitation renderers need only the workspace identity.
-- RLS bypass does not replace explicit table privileges for the service role.
grant select on table public.workspaces to service_role;

commit;
