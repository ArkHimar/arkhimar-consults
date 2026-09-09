# ArkHimar PM implementation status

Updated: 2026-09-09

Phase 3 deployed implementation commit: `c5f7a42`

Production deployment: `dpl_8eURgW3uxFJUa4mHwHggrSRDaYri`

## Current master-prompt phase

The formal production sequence has completed **Phase 3 of 8 — Core Planning** and is ready for Phase 4. Phase 1's secure foundation, Phase 2's initiation governance, and Phase 3's master/subsidiary plans, scope, requirements traceability, WBS dictionary and immutable scope baselines are production-governed. Later phases remain validation flows until normalized in turn.

## Delivered across the implementation

- Phase 0: repository, routes, visual language, deployment and risk audit.
- Phase 1 production foundation: branded responsive shell, six-step creation workflow, tenant-scoped persisted projects, project overview, readiness checklist, enforced roles and server audit history.
- Phase 2 production initiation: normalized and versioned business cases and charters; structured options analysis with fixed weighted scoring; server-governed submission, change request, approval and revision decisions; immutable approved versions and tenant-scoped decision history.
- Phase 3 production core planning: structured master plan and all 25 subsidiary plan editors; normalized requirements and RTM records; hierarchical WBS with keyboard-accessible movement and structured dictionary fields; atomic planning saves; owner/admin scope-baseline approval; immutable snapshots; and change-referenced baseline revisions.
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
- Server-authorized DOCX and PDF controlled-document exports with native editable DOCX content, embedded Unicode PDF fonts, deterministic filenames, document-control metadata and export audit events.
- Expiring external shares for approved versions with one-time token display, SHA-256 token storage, revocation, download limits and public-token isolation from browser history and HTTP referrers.
- Integrated Consult/PM resource registry with six architecture resources and five PM workflow packs, public resource routes, substantial original worksheets, deterministic design-readiness and brief-building tools, privacy-filtered funnel events and safe project-enquiry handoff.
- Lead-resource delivery through a validated, honeypot-protected, database-rate-limited API with separate marketing consent and restricted lead access.
- Allowlisted “Use in PM” workflow that requires explicit project selection, creates only a controlled draft, records source/version traceability and writes both import and audit events.

Database migrations through `202609090013_phase3_core_planning.sql` were applied and verified in Supabase project `mbveqvzlrpsyhmsfpdfk` on 2026-09-09. The Phase 3 save, baseline approval and authorized revision lifecycle completed inside a rolled-back production transaction. The existing `AKH-026` planning content was then migrated through the live governed save path and verified after a full reload. No baseline was approved on the user's behalf.

The production code is connected to the ArkHimar Supabase project and deployed at `https://www.arkhimar.com/pm/`. Public browser configuration contains only the Supabase URL and publishable key; server and email-provider credentials remain encrypted deployment secrets.

The Phase 3 production bundle, authenticated workspace loading, structured Planning screen, persisted normalized draft, API authentication boundaries and private-page noindex protection were verified after deployment. The Consult start-a-project form remains on its existing FormSubmit delivery path; the n8n payload is a separate synthetic testing reference and no n8n webhook was added to production.

Live secure-share lifecycle verification completed on 2026-09-09 using the approved `QA-EXP-20260908` fixture: the fragment token was removed from the visible URL before the POST request, two permitted PDF downloads succeeded, the third was rejected at the configured limit, separately expired and revoked tokens were rejected, and the final database check showed zero externally available test shares. All three temporary shares were revoked and the fixture was archived afterward.

## Remaining production boundary

This release is a coherent product-validation build, not the production multi-user system described by the full brief. The source repository began as a static site with no backend. The following require a separately provisioned server/database and deployment secrets:

- Administrative account recovery and organization-wide session policy controls;
- normalized relational storage for every advanced control register and full concurrent-edit conflict UI;
- malware scanning/quarantine integration;
- optional share passwords and recipient identity verification for highly restricted external distribution;
- full FS/SS/FF/SF calendar scheduling and high-volume Gantt virtualization;
- server-generated XLSX and PPTX project/register exports;
- notification jobs, secure AI provider integration and organization knowledge retrieval;
- automated tenant-isolation, authorization and full browser E2E suites.

No production compliance or certification is claimed. Do not enter confidential data in the validation workspace.
