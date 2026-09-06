# ArkHimar Consult

Production reconstruction of the ArkHimar public site, plus a connected browser-based validation release of ArkHimar PM, in the original repository.

## Run locally

Requires Node.js 24. Copy `.env.example` to `.env.local` and supply a Supabase public URL and publishable anonymous key for the authenticated PM application.

```sh
npm run dev
```

Open `http://localhost:4173`.

## Verify

```sh
npm run check
npm test
npm run build
```

The production-ready static artifact is written to `dist/` and can be served by any static host with directory-index support.

## Routes

- `/` — ArkHimar Consult public website
- `/start-a-project/` — complete project enquiry workflow
- `/project-management/` — ArkHimar PM public product page
- `/project-management/pricing/` — private-beta pricing and exact-seat calculator
- `/project-management/demo/` — guided nine-step product demo
- `/project-management/early-access/` — waitlist, design-partner and enterprise interest
- `/project-management/features/` — current capability registry
- `/project-management/templates/` — project artifact template library
- `/project-management/tools/` — free ROI/NPV, EVM, PERT, risk and readiness tools
- `/project-management/solutions/` — role and industry use cases
- `/project-management/compare/` — comparison publishing policy
- `/project-management/security/` — current trust and production boundary
- `/project-management/resources/` and `/project-management/changelog/`
- `/pm/` — ArkHimar PM validation workspace

## Product status

The public site and enquiry UI are complete static routes. The PM validation workspace now includes a six-step project setup, readiness scoring, business-case calculations, versioned charter approval, scope/requirements/WBS planning, schedule critical path, cost/EVM controls, RAID/change registers, status snapshots, audit events and JSON/CSV/TXT/print exports. It includes tested deterministic financial, EVM, risk, weighted-scoring and critical-path engines.

The PM workspace now uses Supabase Auth, PostgreSQL tenancy with row-level security, role-restricted mutations, append-only server audit events and private object storage with expiring signed links. It also includes a scoped API-key Integration Hub and a branded email/letter Communications Studio with server-side Resend delivery. The integration requires backend provisioning and environment variables before it becomes operational on a deployment. See [docs/PRODUCTION_BACKEND_SETUP.md](docs/PRODUCTION_BACKEND_SETUP.md), [docs/INTEGRATIONS_COMMUNICATIONS_IMPLEMENTATION_PROMPTS.md](docs/INTEGRATIONS_COMMUNICATIONS_IMPLEMENTATION_PROMPTS.md) and [docs/PM_IMPLEMENTATION_STATUS.md](docs/PM_IMPLEMENTATION_STATUS.md).

The public PM marketing system is configured for `private_beta`. Its pricing is explicitly labelled as a hypothesis, its claim registry hides planned capabilities, and its provider-neutral analytics layer rejects project content. Lead forms use the already configured `projects@arkhimar.com` FormSubmit route. See [docs/MARKETING_IMPLEMENTATION_STATUS.md](docs/MARKETING_IMPLEMENTATION_STATUS.md).

See [docs/REPOSITORY_AUDIT.md](docs/REPOSITORY_AUDIT.md) for the baseline audit and production risks.
