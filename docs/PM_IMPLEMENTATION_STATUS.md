# ArkHimar PM implementation status

Updated: 2026-09-07

## Delivered in the validation release

- Phase 0: repository, routes, visual language, deployment and risk audit.
- Phase 1 UI/domain foundation: branded responsive shell, local workspace, six-step creation workflow, project overview, readiness checklist and append-style activity history.
- Phase 2 validation flows: business-case narrative, deterministic ROI/NPV/payback/BCR, charter draft/submission/approval and immutable approved snapshot.
- Phase 3 validation flows: master-plan summary, scope, requirements, WBS and versioned scope-baseline snapshots.
- Phase 4 validation flows: activity/dependency entry, cycle rejection, deterministic CPM, schedule baseline, budget, reserves and EVM metrics.
- Phase 5 validation flows: risk, issue, change and stakeholder registers; explicit change approval.
- Phase 6 validation flows: project health, status-report snapshots and demonstration project.
- Phase 7 validation flows: portable JSON backup, flat CSV controls, TXT project pack and print/PDF output.
- Phase 8 UI work: keyboard focus, skip navigation, reduced motion, responsive layouts, empty states and production build checks.

## Production foundation added

- Supabase email/password authentication, verification and password-reset UI.
- Workspace bootstrap and membership roles.
- PostgreSQL project persistence with row-level tenant isolation.
- Role-restricted inserts, updates, deletes and membership management.
- Server-generated append-only project audit events.
- Private project-document bucket with membership policies and short-lived signed URLs.
- Client-side type/size checks backed by storage-bucket limits and database constraints.
- CSP, private-app noindex and non-cached public runtime configuration.
- Workspace Communications Studio with structured branded email/letter blocks, live preview, templates, private attachments and delivery history.
- Workspace brand settings for colors, sender identity, logo and letterhead assets.
- Integration Hub with one-time API-key display, SHA-256 hashes, scopes, revocation, rate limits and a validated form-submission endpoint.
- Server-side Resend adapter with verified user sessions, role checks, idempotency and HTML/plain-text output.
- Workspace Team & Access screen with member role controls, member removal and expiring email invitations.
- One-time invitation acceptance bound to the authenticated email address, with revocation, audit events and owner/admin escalation boundaries.
- TOTP authenticator enrollment, AAL2 sign-in challenges, factor removal and selective session revocation from the profile security panel.
- Tenant-scoped controlled document register with document IDs, metadata, confidentiality, draft/review/approval/archive transitions, immutable approved versions and audited revisions.

The production code is connected to the ArkHimar Supabase project and deployed at `https://www.arkhimar.com/pm/`. Public browser configuration contains only the Supabase URL and publishable key; server and email-provider credentials remain encrypted deployment secrets.

## Remaining production boundary

This release is a coherent product-validation build, not the production multi-user system described by the full brief. The source repository began as a static site with no backend. The following require a separately provisioned server/database and deployment secrets:

- Administrative account recovery and organization-wide session policy controls;
- normalized relational storage for every advanced control register and full concurrent-edit conflict UI;
- malware scanning/quarantine integration;
- protected external document share links with expiry, revocation and download controls;
- full FS/SS/FF/SF calendar scheduling and high-volume Gantt virtualization;
- server-generated DOCX, XLSX and PPTX controlled documents (branded HTML and print/PDF letter output is now available);
- notification jobs, secure AI provider integration and organization knowledge retrieval;
- automated tenant-isolation, authorization and full browser E2E suites.

No production compliance or certification is claimed. Do not enter confidential data in the validation workspace.
