# ArkHimar Consult

Production reconstruction of the ArkHimar public site, plus a connected browser-based validation release of ArkHimar PM, in the original repository.

## Run locally

Requires Node.js 20 or newer.

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
- `/pm/` — ArkHimar PM validation workspace

## Product status

The public site and enquiry UI are complete static routes. The PM validation workspace now includes a six-step project setup, readiness scoring, business-case calculations, versioned charter approval, scope/requirements/WBS planning, schedule critical path, cost/EVM controls, RAID/change registers, status snapshots, audit events and JSON/CSV/TXT/print exports. It includes tested deterministic financial, EVM, risk, weighted-scoring and critical-path engines.

The workspace still stores its data in the local browser and clearly labels this limitation in the UI. Do not use it for confidential or multi-user project data until authentication, PostgreSQL tenancy, server-side authorization, private file storage and server-generated controlled exports are implemented. See [docs/PM_IMPLEMENTATION_STATUS.md](docs/PM_IMPLEMENTATION_STATUS.md) for the phase-by-phase boundary.

See [docs/REPOSITORY_AUDIT.md](docs/REPOSITORY_AUDIT.md) for the baseline audit and production risks.
