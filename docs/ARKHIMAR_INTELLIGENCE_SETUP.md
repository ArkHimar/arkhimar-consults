# ArkHimar Intelligence setup

ArkHimar Intelligence is integrated into the authenticated PM workspace. The browser receives no provider secrets. Every request resolves the signed-in user, workspace membership and project boundary on the server.

## Required production variables

- `OPENAI_API_KEY`: enables live specialist reasoning. Without it, the interface deliberately returns a grounded project snapshot and reports degraded status.
- `ARKHIMAR_AI_MODEL`: optional Responses API model override; defaults to `gpt-5-mini`.
- `VAPI_API_KEY` and `VAPI_WEBHOOK_SECRET`: optional telephone adapter. Telephone sessions remain disabled without them.
- Existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `PUBLIC_SITE_URL` remain server-side.

## Safety model

- R0 reads and R1 drafts are safe operations.
- R2 reversible mutations require an authenticated writer and create an audit event.
- R3 governed actions are held for an existing approval workflow.
- R4 actions such as contractual acceptance, payments, signing, deletion, or permission escalation are never executed autonomously.
- Uploaded document text is treated as untrusted data, never as system instructions.
- Voice sessions require explicit audio consent; telephone mode additionally requires configured disclosure and Vapi credentials.

## Database

Apply `supabase/migrations/202609120019_arkhimar_intelligence.sql`. It adds tenant-scoped conversations, messages, proposals, audit events, feedback, and automation settings with row-level security.

## Authentication email delivery

Account verification and recovery use `/api/v1/auth/email`, Supabase Admin link generation, and ArkHimar's existing Resend provider. This avoids the shared Supabase trial SMTP quota that previously returned `429 over_email_send_rate_limit`. Supabase email links are configured for 24 hours; user sessions have no time-box or inactivity timeout and refresh automatically.
