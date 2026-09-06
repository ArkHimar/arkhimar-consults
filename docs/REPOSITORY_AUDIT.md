# Repository audit

Date: 2026-09-06  
Branch: `feat/lovable-production-rebuild-pm`  
Baseline commit: `a619b067acd53ecf6e197aaea711ecf4b5faaac9`

## Before this rebuild

- One 447-line static `index.html` and one MP4 asset.
- No package manager metadata, framework, router, component library, backend, authentication, database, storage adapter, automated tests, or deployment configuration.
- Two commits on `main`; no alternate Lovable branch or source in reachable history.
- One-page hash routes for About, Services, Projects, Design Studio, Spatial Lab and Contact.
- Contact submission posted directly from the browser to FormSubmit.
- No canonical URL, sitemap, structured data, CSP configuration or automated accessibility checks.

## Canonical visual reference

The reference at `https://arkhimar.lovable.app/` uses Syne and Inter, a restrained cream/charcoal palette, editorial serif emphasis, fine rules, generous section spacing and five architectural photographs. Its routes are `/` and `/start-a-project`.

## Implemented architecture

The deployment remains static and dependency-free to preserve the repository's hosting compatibility. Routes use directory indexes. Node scripts provide local serving, validation, unit tests and a deterministic `dist/` build. ArkHimar PM is introduced as a deliberately labelled early-access foundation rather than presenting incomplete governance functions as production-ready.

## Compatibility and production risks

- The enquiry workflow still relies on a third-party FormSubmit endpoint. Confirm its activation and privacy terms before launch, or replace it with an owned serverless handler.
- ArkHimar PM currently stores projects in the local browser. It is suitable for product validation, not confidential multi-user production use.
- Authentication, relational storage, tenant isolation, server-side authorization and controlled-document exports require a production backend milestone before PM launch.
- The business phone number was updated to the owner-supplied `+234 805 871 6249` on 2026-09-06.
