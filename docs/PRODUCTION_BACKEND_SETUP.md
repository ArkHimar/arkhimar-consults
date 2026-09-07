# ArkHimar PM production backend setup

The application integration is active on `https://www.arkhimar.com`. Supabase project `mbveqvzlrpsyhmsfpdfk` was provisioned in West Europe (London) on 6 September 2026, the checked-in migrations were applied, and the hosted login detects the configured backend.

## Activation status

- Supabase project created and healthy.
- Controlled-document tables and their membership-scoped row-level security policies are active.
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
- Resend workspace `emavericks22` verified as the owner of the verified `arkhimar.com` and `mail.arkhimar.com` sending domains.
- A dedicated Resend key named `ArkHimar PM Production` was created with sending-only access restricted to `arkhimar.com` and stored only as an encrypted Vercel production secret.
- Production sender `notifications@arkhimar.com` and notification recipient `projects@arkhimar.com` activated in Vercel deployment `dpl_AbVGdrE9wsQY8eg8bsrk2LPu3fnD`.
- End-to-end form notification `ts-academy-email-delivery-test` was accepted by the ArkHimar API and reported `delivered` by Resend on 7 September 2026. Its temporary verification API key was revoked after the test.
- A two-real-user production role matrix was completed on 7 September 2026 with a temporary verified account: viewer reads were tenant-scoped and mutations were denied; member private upload/download/delete succeeded while controlled project and email mutations were denied; project manager project create/update and branded email send succeeded while deletion was denied; admin project deletion succeeded.
- Membership policies were tightened and verified so an admin cannot promote their own account to owner or delete the workspace owner.
- Branded email delivery to `projects@arkhimar.com` was reported `delivered` by Resend through the production message endpoint, and repeating the same idempotency key returned the original message without sending a duplicate.
- Temporary role-test projects, messages, memberships and the temporary authentication account were removed after verification; all four cleanup counts returned zero.
- Production deployment `dpl_BmMJLjmrAHGGfZWRNGEkovGKEcuG` contains the role-boundary, recipient-contract and no-brand email fallback fixes.
- Expiring, email-bound workspace invitations and the Team & Access administration screen were deployed in `dpl_7GKB2RGt8NitH9azhN3dKVNvADKe`; the production endpoint rejects unauthenticated invitation requests and keeps invite tokens out of HTTP query strings.
- TOTP enrollment, enforced AAL2 challenges for enrolled accounts, factor removal and “sign out other sessions” controls were deployed in `dpl_21yDJtezW6pHonJ1DEmSFHWfzDmB`. Ordinary sign-out now ends only the current device session.
- Controlled document registration, review, owner/admin approval, immutable approved versions and audited revision creation were activated on 7 September 2026. A create → review → approve → revise lifecycle test completed inside a rolled-back transaction.

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
   - `supabase/migrations/202609070005_membership_role_boundaries.sql`
   - `supabase/migrations/202609070006_outbound_recipient_contract.sql`
   - `supabase/migrations/202609070007_workspace_invitations.sql`
   - `supabase/migrations/202609070008_controlled_documents.sql`
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
- Owners can invite admins, project managers, members and viewers; admins cannot invite or modify admins.
- Invitation acceptance requires a non-expired, non-revoked token and an authenticated account whose email exactly matches the invitation.
- Project managers can register and submit controlled documents; only owners/admins can approve or archive them; approved version content cannot be altered or deleted.

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
- Decide whether MFA becomes mandatory for privileged roles before opening general production access.
- Run an owner-sent two-user invitation acceptance and revocation exercise before opening public self-service onboarding.
- Add malware scanning/quarantine integration for files.
- Repeat the two-user role matrix after material authorization, schema or storage-policy changes.
- Review privacy, retention, deletion and incident-response procedures.
