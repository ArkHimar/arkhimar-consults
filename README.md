# ArkHimar Consult

Production reconstruction of the ArkHimar public site, plus the first gated foundation of ArkHimar PM, in the original repository.

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
- `/pm/` — early-access PM workspace foundation

## Product status

The public site and enquiry UI are complete static routes. The PM workspace supports accessible project creation and browser persistence, and includes tested deterministic financial, EVM, risk, weighted-scoring and critical-path engines. It is intentionally labelled as an early-access foundation: do not use it for confidential or multi-user project data until authentication, PostgreSQL tenancy, server-side authorization, audit history and controlled exports are implemented.

See [docs/REPOSITORY_AUDIT.md](docs/REPOSITORY_AUDIT.md) for the baseline audit and production risks.
