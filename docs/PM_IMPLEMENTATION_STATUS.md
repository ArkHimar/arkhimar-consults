# ArkHimar PM implementation status

Updated: 2026-09-09

Phase 5 deployed implementation commit: `fad350e`

## Current master-prompt phase

The implementation sequence has completed **all 8 phases** in source. Phase 6 adds governed execution, agile/hybrid delivery, reporting and governance. Phase 7 adds authenticated controlled project-pack exports. Phase 8 completes accessibility, responsive hardening, regression coverage and release validation.

## Delivered across the implementation

- Phase 0: repository, routes, visual language, deployment and risk audit.
- Phase 1 production foundation: branded responsive shell, six-step creation workflow, tenant-scoped persisted projects, project overview, readiness checklist, enforced roles and server audit history.
- Phase 2 production initiation: normalized and versioned business cases and charters; structured options analysis with fixed weighted scoring; server-governed submission, change request, approval and revision decisions; immutable approved versions and tenant-scoped decision history.
- Phase 3 production core planning: structured master plan and all 25 subsidiary plan editors; normalized requirements and RTM records; hierarchical WBS with keyboard-accessible movement and structured dictionary fields; atomic planning saves; owner/admin scope-baseline approval; immutable snapshots; and change-referenced baseline revisions.
- Phase 4 production schedule and cost management: normalized, versioned schedules and cost controls; activity codes, working calendars, milestones and FS/SS/FF/SF dependencies with lead/lag; deterministic CPM, cycle rejection, float and critical-path display; bounded Gantt presentation; budget, reserves, cost records and cash-flow/S-curve data; complete earned-value forecast variants; owner/admin immutable baseline approval; and change-referenced revisions.
- Phase 5 production project controls: normalized risk plans, threat/opportunity registers, issue logs, stakeholder registers and engagement actions; deterministic exposure and power/interest views; PM-only stakeholder notes protected from ordinary members and historical snapshots; immutable register versions; and a server-enforced change workflow from draft through CCB decision, implementation, verification and closure, with owner/admin approval boundaries and baseline-revision links.
- Phase 6 production implementation: versioned execution settings, iterations/releases/stages, connected backlog and work items, WIP enforcement, acceptance evidence, durable governance reviews and owner/admin decisions, plus immutable status reports with connected delivery/control/EVM metrics.
- Phase 7 production implementation: authenticated tenant-authorized JSON, CSV, TXT and paginated PDF project packs assembled server-side from current normalized planning, schedule, cost, execution, control, governance and reporting records; deterministic filenames, private no-store responses and audit events.
- Phase 8 release hardening: expanded keyboard focus treatments, responsive overflow for delivery boards and navigation, reduced-motion support, automated phase-contract regression tests, clean production build, and Lighthouse accessibility/best-practices scores of 100/100 for the public ArkHimar PM route.

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
- Server-authorized DOCX and PDF controlled-document exports with native editable DOCX content, embedded Unicode PDF fonts, deterministic filenames, document-control metadata and export audit events.
- Expiring external shares for approved versions with one-time token display, SHA-256 token storage, revocation, download limits and public-token isolation from browser history and HTTP referrers.
- Integrated Consult/PM resource registry with six architecture resources and five PM workflow packs, public resource routes, substantial original worksheets, deterministic design-readiness and brief-building tools, privacy-filtered funnel events and safe project-enquiry handoff.
- Lead-resource delivery through a validated, honeypot-protected, database-rate-limited API with separate marketing consent and restricted lead access.
- Allowlisted “Use in PM” workflow that requires explicit project selection, creates only a controlled draft, records source/version traceability and writes both import and audit events.

Database migrations through `202609090016_phase5_snapshot_privacy.sql` were applied and verified in Supabase project `mbveqvzlrpsyhmsfpdfk` on 2026-09-09. Migration `202609090017_phase6_execution_reporting.sql` is the final schema migration and must be applied before enabling Phase 6 mutations in production. The client degrades safely to empty execution/reporting state when that relation is not yet present.

The production code is connected to the ArkHimar Supabase project and deployed at `https://www.arkhimar.com/pm/`. Public browser configuration contains only the Supabase URL and publishable key; server and email-provider credentials remain encrypted deployment secrets.

The Phase 5 production bundle, authenticated workspace loading, governed Risks & Controls screen, persisted normalized registers, change-decision boundaries, API authentication boundaries and private-page meta/HTTP noindex protection were verified after deployment. The Consult start-a-project form remains on its existing FormSubmit delivery path; the n8n payload is a separate synthetic testing reference and no n8n webhook was added to production.

Live secure-share lifecycle verification completed on 2026-09-09 using the approved `QA-EXP-20260908` fixture: the fragment token was removed from the visible URL before the POST request, two permitted PDF downloads succeeded, the third was rejected at the configured limit, separately expired and revoked tokens were rejected, and the final database check showed zero externally available test shares. All three temporary shares were revoked and the fixture was archived afterward.

## Remaining operational boundary

This release is a coherent product-validation build, not the production multi-user system described by the full brief. The source repository began as a static site with no backend. The following require a separately provisioned server/database and deployment secrets:

- Administrative account recovery and organization-wide session policy controls;
- normalized relational storage for specialist quality, resource and procurement registers, plus full concurrent-edit conflict UI;
- malware scanning/quarantine integration;
- optional share passwords and recipient identity verification for highly restricted external distribution;
- high-volume Gantt virtualization and enterprise resource leveling;
- server-generated XLSX and PPTX project/register exports (Phase 7 delivers JSON, CSV, TXT and PDF);
- notification jobs, secure AI provider integration and organization knowledge retrieval;
- automated tenant-isolation, authorization and full browser E2E suites.

No production compliance or certification is claimed. Do not enter confidential data in the validation workspace.
