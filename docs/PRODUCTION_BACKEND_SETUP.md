# ArkHimar PM production backend setup

The application integration is active on `https://www.arkhimar.com`. Supabase project `mbveqvzlrpsyhmsfpdfk` was provisioned in West Europe (London) on 6 September 2026, the checked-in migrations were applied, and the hosted login detects the configured backend.

## Activation status

- Supabase project created and healthy.
- 10 expected application tables verified.
- 24 public-schema row-level security policies verified.
- Authenticated table privileges verified; anonymous access to workspace membership remains denied.
- `project-documents` and `workspace-brand-assets` verified as private buckets, with three project-file policies and four brand-asset policies.
- Replacement publishable and server secret keys stored in Vercel; no server secret is written to source control or browser runtime configuration.
- Legacy JWT-based API keys disabled and the previous HS256 signing key revoked.
- Demo and `www.arkhimar.com` PM login redirect URLs allow-listed.
- Production bundle at `https://www.arkhimar.com/pm/pm.js` verified to include the workspace startup recovery added in commit `b5b761f`.
- Initial owner account and email confirmation completed.
- Workspace `ArkHimar Consults` bootstrapped with the initial user as `owner` on 7 September 2026.
- Demonstration project `Lagos Civic Learning Hub` (`AKH-DEMO`) created through the authenticated owner role on 7 September 2026; its insert audit event was verified.
- A simulated unrelated authenticated identity saw zero workspaces, projects and audit events through row-level security.
- Private DOCX upload verified against `AKH-DEMO`; document metadata, non-public bucket state and the insert audit event were confirmed.
- Scoped key `TS Academy assignment` created with only `forms:submit` access. A production submission returned `201`, was associated with `AKH-DEMO`, incremented key usage and created its receive audit event; an invalid key returned `401`.
- Vercel production deployment `dpl_8D2shfSZ4gRvUvDhGdfVmUn5xhkx` includes the encrypted Supabase server secret and API request hash salt.
- A full two-real-user role matrix and production email delivery remain to be completed.

## Architecture

- Supabase Auth manages verified email/password sessions and password reset.
- PostgreSQL stores workspaces, membership, projects, document metadata and audit events.
- Row-level security checks the authenticated user on every protected query.
- Roles are `owner`, `admin`, `project_manager`, `member` and `viewer`.
- The `project-documents` bucket is private. Access is membership-scoped and downloads use 60-second signed URLs.
- The browser receives only the Supabase public URL and publishable anonymous key. Never expose the service-role key.

## Provisioning

1. Create a Supabase project in the organization and select the appropriate production region.
2. Open the SQL editor and apply the migrations in filename order:
   - `supabase/migrations/202609060001_pm_foundation.sql`
   - `supabase/migrations/202609060002_integrations_communications.sql`
   - `supabase/migrations/202609070003_authenticated_privileges.sql`
   - `supabase/migrations/202609070004_service_role_privileges.sql`
3. In Authentication → URL Configuration, set the Site URL to the intended host and add:
   - `https://arkhimar-consults-demo.vercel.app/pm/login/`
   - `https://www.arkhimar.com/pm/login/` only when production cutover is approved.
4. Enable email confirmation. Configure a production SMTP provider before public launch so authentication mail does not depend on development limits.
5. Add these Vercel environment variables to the intended deployment environments:
   - `PUBLIC_SUPABASE_URL`
   - `PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_URL` (server only)
   - `SUPABASE_SERVICE_ROLE_KEY` (server only; never use in browser code)
   - `RESEND_API_KEY` (server only)
   - `RESEND_FROM_EMAIL` (verified sender address, for example `notifications@arkhimar.com`)
   - `FORM_NOTIFICATION_EMAIL=projects@arkhimar.com`
   - `PUBLIC_SITE_URL`
   - `API_IP_HASH_SALT` (random server-only value)
6. Redeploy. The build generates `/runtime-config.js` and prevents that file from being cached.
7. Create an account, verify email, sign in, create the first workspace, create a project and upload a harmless test document. The production activation completed through the first project, private upload and scoped form API submission on 7 September 2026.

## Required verification

- A logged-out request to `/pm/` redirects to `/pm/login/`.
- A verified user can bootstrap exactly one initial workspace.
- A user cannot select a workspace or project without membership.
- `viewer` cannot insert or update projects or upload files.
- `member` can upload documents but cannot create or update controlled project data.
- `project_manager`, `admin` and `owner` can update project records.
- Only `owner` and `admin` can delete projects or manage workspace membership.
- Storage objects are not public and signed URLs expire.
- Project insert/update/delete writes an `audit_events` row; clients cannot insert, update or delete audit rows.
- Owners/admins can create a `forms:submit` API key, use it against `/api/v1/forms/submit`, and revoke it immediately.
- Project managers can send a branded test email; viewers and members receive a server-side 403.
- A repeated email idempotency key does not send a duplicate message.

## Connected-form assignment

After provisioning, sign in as the workspace owner and open **Integrations & API**. Create a key named `TS Academy assignment`; copy it immediately and store it as a secret in Postman or n8n. Send JSON to:

```text
POST https://YOUR-DEPLOYMENT/api/v1/forms/submit
x-api-key: akh_live_YOUR_KEY
content-type: application/json
```

Example body:

```json
{
  "formId": "ts-academy-assignment",
  "name": "Ada Student",
  "email": "ada@example.com",
  "message": "My form is connected to ArkHimar PM.",
  "fields": {
    "course": "AI and Automation"
  }
}
```

The API key is an ArkHimar integration credential. It is not the Resend key and cannot access the Supabase service role.

## Before handling confidential data

- Configure backup and point-in-time recovery appropriate to the plan.
- Configure production SMTP, custom email templates and abuse/rate-limit thresholds.
- Add MFA policy and session-revocation administration.
- Add invitation UI and test role transitions.
- Add malware scanning/quarantine integration for files.
- Run two-user cross-tenant integration tests against a non-production project.
- Review privacy, retention, deletion and incident-response procedures.
