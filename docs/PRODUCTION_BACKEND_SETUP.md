# ArkHimar PM production backend setup

The application integration and database migration are committed in this repository. A Supabase project must be provisioned before the hosted login can operate.

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
7. Create an account, verify email, sign in, create the first workspace, create a project and upload a harmless test PDF.

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
