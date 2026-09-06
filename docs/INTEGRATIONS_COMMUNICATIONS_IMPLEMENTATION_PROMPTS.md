# ArkHimar PM — Integration and Communications implementation prompts

These prompts translate the product brief and the TS Academy connected-form assignment into implementation work. They are written as reusable engineering prompts, but the corresponding foundation is implemented in this repository.

## Prompt 1 — Secure Integration Hub

Build a workspace-level Integration Hub inside ArkHimar PM. Workspace owners and admins can create named API keys with explicit scopes. Show the full secret once, store only a SHA-256 hash, display only a safe prefix afterward, record last use and usage count, and support immediate revocation. Do not expose the Supabase service-role key, Resend key, or user API keys in browser bundles, URLs, logs, analytics, or source control. Explain that public browser JavaScript should not contain a secret key.

Provide a versioned endpoint at `POST /api/v1/forms/submit`. Accept a key through `x-api-key` or a Bearer header. Validate JSON at the server boundary, cap payload size, derive the tenant exclusively from the authenticated key, optionally verify that a supplied project belongs to that tenant, enforce a persistent per-key rate limit, store the response in a tenant-isolated submission inbox, and return stable JSON error codes. Never trust a client-supplied workspace ID.

Acceptance:

- Only owners/admins issue and revoke keys.
- A revoked, expired, incorrectly scoped, or unknown key is rejected.
- Keys cannot read another tenant’s submissions.
- Valid requests produce a durable submission ID.
- The UI provides a copyable endpoint and cURL example for n8n, Postman, Zapier, Make, or a custom server.

## Prompt 2 — Branded Communications Studio

Build an ArkHimar-styled Communications Studio for workspace owners, admins, and project managers. Use a friendly two-column editor and live preview with generous spacing, a light cream canvas, a strong typographic header, readable body copy, optional call-to-action button, divider, and signature. Content must be represented as validated structured blocks, not arbitrary user HTML. Escape user content and allow only safe link protocols.

Allow users to prepare email and letter variants; select a project; add To and CC recipients; write a subject and preview text; edit the heading, friendly message, button label/link, and signature; attach authorized private project files; save reusable versioned templates; download a standalone letter; print/save it as PDF; and view delivery history.

Acceptance:

- Preview uses the same deterministic renderer as server delivery.
- Unsafe HTML is escaped and unsafe links are neutralized.
- Repeated send attempts use an idempotency key.
- The server verifies the Supabase user and workspace role at send time.
- Delivery results and failures are stored without leaking provider secrets.

## Prompt 3 — Workspace brand and letterhead

Add tenant-specific brand settings: sender name, reply-to address, primary color, accent color, cream/background color, and footer copy. Permit logo and letterhead uploads only for owners/admins. Store brand files in a private workspace bucket with type and size restrictions and membership-scoped read access. Preserve the ArkHimar default identity when no override exists.

Acceptance:

- Brand changes persist per workspace.
- Other tenants cannot discover or download the assets.
- User-selected colors are constrained to valid six-digit hex colors.
- Brand settings are applied to previews, letters, and email rendering.

## Prompt 4 — Provider adapter and delivery safety

Implement email delivery behind a server endpoint. Use Resend as the first provider adapter because the ArkHimar domain is already configured there, while keeping provider details outside the editor. Store `RESEND_API_KEY` and the Supabase service key only in the deployment secret manager. Use a verified `RESEND_FROM_EMAIL`, configurable reply-to, plain-text and HTML alternatives, attachment size checks, stable error handling, and Resend idempotency headers.

Acceptance:

- No provider key is sent to the browser.
- User JWTs are validated against Supabase Auth before authorization.
- Unauthorized roles receive 403 without creating a message.
- Attachments must belong to the same workspace.
- Successful sends create append-only audit metadata.

## Prompt 5 — Next-phase expansion

Extend this foundation into the full document/export phase: controlled document IDs and statuses, immutable approved versions, review/approval workflows, organization letterhead rendering, server-generated DOCX/PDF, export jobs, ZIP project packs, notification preferences, invitation emails, and provider-neutral automation events. Add two-tenant integration tests, email-provider mocks, accessibility tests, file quarantine hooks, and webhook signing before confidential production use.

