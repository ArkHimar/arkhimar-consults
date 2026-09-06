# ArkHimar SEO Implementation Report

Date: 6 September 2026  
Repository: `ArkHimar/arkhimar-consults`  
Canonical production origin: `https://www.arkhimar.com`

## Outcome

The repository now has a build-time SEO system for two distinct public topic clusters: ArkHimar Consult and ArkHimar PM. It generates normalized metadata, canonical URLs, social metadata, structured data, crawl controls and the XML sitemap from one route configuration. Private ArkHimar PM workspace routes remain excluded and `noindex`.

No Jordan Studio, Design & Illustration, Independent artist/designer, Lovable canonical, or Vercel canonical metadata was found in the repository baseline or remains in generated output.

## Baseline audit

Before implementation, the site had:

- a strong public homepage but its About, Services, Projects, Process and Contact destinations were page fragments rather than separate crawlable pages;
- metadata on existing routes, but inconsistent titles/descriptions and trailing-slash canonicals that conflicted with Vercel's `trailingSlash: false` behavior;
- a basic sitemap and robots file without an environment-aware preview policy;
- no maintainable shared metadata route map;
- no complete Open Graph/Twitter image system for the architecture and PM clusters;
- incomplete structured-data coverage and a PM offer that could imply unapproved pricing;
- no branded 404 or old portfolio-route mapping;
- private PM HTML `noindex`, but no matching `X-Robots-Tag` response policy.

The live-domain inventory could not be independently fetched during implementation because DNS resolution was unavailable in the execution environment. The migration mapping therefore covers the known old portfolio aliases (`/work` and `/works`) and the requested `/start-project` alias. Search Console should be checked for additional historical URLs before final DNS cutover.

## Files and systems changed

- `seo/config.mjs`: canonical origin, page metadata, service inventory, sitemap and robots policy.
- `seo/render.mjs`: metadata injection, JSON-LD, new public-page rendering, preview/production controls.
- `scripts/build.mjs`: environment-aware SEO generation after the static app build.
- `scripts/check.mjs` and `tests/seo.test.mjs`: automated SEO policy and output QA.
- `vercel.json`: canonical-host and old-route redirects; private PM/API `X-Robots-Tag` headers.
- `index.html` and `start-a-project/index.html`: crawlable navigation and important service content in HTML.
- `styles.css`: responsive public content-page, breadcrumb and card styles.
- `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, `site.webmanifest`: ArkHimar identity assets.
- `assets/images/og-arkhimar-consult.jpg` and `assets/images/og-arkhimar-pm.png`: separate 1200×630 social cards.
- `404.html`: branded real 404 destination with useful recovery links.

## Public information architecture

The production build includes:

- ArkHimar Consult: `/`, `/about`, `/services`, `/projects`, `/how-it-works`, `/start-a-project`, `/contact`.
- Twelve service pages derived only from the twelve services already present in source, under `/services/[service-slug]`.
- ArkHimar PM: `/project-management`, `/features`, `/pricing`, `/demo`, `/templates`, `/resources`, `/tools`, `/solutions`, `/compare`, `/security`, `/changelog`, `/early-access`, `/privacy`, and `/terms` under the product prefix.

The package-requested `/start-project` path permanently redirects in one hop to the existing canonical `/start-a-project`, preserving the working form route.

Individual project case-study pages were withheld because the repository currently has only project names, categories, locations and representative images—not enough verified information for substantial case studies. The crawlable `/projects` page presents only those verified details.

Thin individual ArkHimar PM feature routes were also withheld. The existing product feature index is substantial; planned features such as AI Copilot are clearly labeled and are not published as standalone search landing pages.

## Metadata and schema

Every configured public route receives:

- a unique title and description;
- an absolute, normalized self-referencing `www.arkhimar.com` canonical without duplicate trailing-slash variants;
- `robots` policy;
- Open Graph site name, title, description, URL, image, image dimensions and image alt;
- Twitter large-image metadata;
- ArkHimar favicon and manifest links.

Structured-data types implemented:

- `Organization` + `ProfessionalService` on the homepage and About page;
- `Service` on the twelve verified service pages;
- `SoftwareApplication` on the ArkHimar PM landing page, without fabricated ratings, reviews or unapproved offers;
- `BreadcrumbList` on nested public pages.

Organization data uses only visible verified details: ArkHimar Consult, the canonical URL, `projects@arkhimar.com`, `+234 805 871 6249`, and Nigeria as the served country. No street address, founder, awards, registrations, employee count or social profiles were invented. A logo property is intentionally omitted until a stable owner-approved logo URL is provided.

## Indexing policy

Production indexing is fail-closed and requires both:

- `VERCEL_ENV=production`; and
- `SEO_INDEXABLE=true`.

Only the deployment serving `www.arkhimar.com` should receive `SEO_INDEXABLE=true`. Preview and demo builds omit public URLs from the sitemap, emit `Disallow: /` in `robots.txt`, and add page-level `noindex,nofollow`. Their canonicals still describe the intended production equivalents but the preview URLs themselves cannot compete as indexable results.

Private routes under `/pm` retain `noindex,nofollow`, are absent from the sitemap, receive `X-Robots-Tag: noindex, nofollow`, and rely on the existing authentication/tenant-permission application layer for data access. API routes also receive the noindex response header.

Production URLs:

- Sitemap: `https://www.arkhimar.com/sitemap.xml`
- Robots: `https://www.arkhimar.com/robots.txt`

## Redirect and migration policy

- `arkhimar.com/:path*` permanently redirects to `https://www.arkhimar.com/:path*` in one hop.
- `/work` and `/works` permanently redirect to `/projects`.
- `/start-project` permanently redirects to `/start-a-project`.
- Unknown URLs use the branded 404 instead of being redirected to the homepage.
- No Lovable or Vercel URL appears in the production sitemap or canonical configuration.

Before DNS cutover, export Google Search Console's historical page list (if a property already exists) and add only close-equivalent one-hop redirects for any valuable legacy URLs discovered there.

## Search Console and Bing owner steps

These manual steps are not marked complete:

1. In Google Search Console, add/verify the `arkhimar.com` Domain property with the DNS TXT record supplied by Google.
2. Optionally set `GOOGLE_SITE_VERIFICATION` in the production deployment if HTML-token verification is also desired. Do not set a fabricated value.
3. Set `SEO_INDEXABLE=true` only for the production environment after `www.arkhimar.com` points to this verified deployment.
4. Submit `https://www.arkhimar.com/sitemap.xml`.
5. Inspect `/`, `/project-management`, `/services`, and priority service pages; request indexing after launch.
6. Monitor Page Indexing, Search Performance, Core Web Vitals, structured-data enhancements, security/manual actions and duplicate canonical reports.
7. Add the site to Bing Webmaster Tools (or import the verified Search Console property) and submit the same sitemap.

## Performance and content findings

- Primary text and navigation are server-delivered static HTML; new pages do not depend on client JavaScript to become crawlable.
- New portfolio images include descriptive alt text, intrinsic dimensions and lazy loading.
- Social images are exactly 1200×630.
- The generated page shell is responsive, and existing reduced-motion behavior remains intact.
- Existing Google Fonts remain a render dependency. Self-hosting or system-font substitution can be evaluated later if field Core Web Vitals show a measurable need.
- The homepage hero is a 1920×1280 JPEG. A future responsive `srcset`/modern-format pass may reduce mobile transfer size, but changing the approved hero presentation was outside this SEO preservation pass.

## Validation completed

- Repository identity search for Jordan/template remnants.
- `npm run check` — passed.
- `npm test` — 20/20 tests passed.
- Preview production build — passed with indexing disabled.
- Production-mode build policy is covered by route, robots, sitemap, metadata, redirect and private-route tests.
- JSON-LD is serialized from structured objects and contains no fabricated reviews, ratings or address.

## Remaining risks and inputs

- Supabase production environment variables are still required for live ArkHimar PM authentication; this is operationally separate from SEO.
- The final custom-domain/DNS attachment and production-only `SEO_INDEXABLE=true` variable must be completed before search launch.
- Google/Bing ownership verification and sitemap submission require owner-console access.
- No verified street address or approved social-profile URLs were available, so they are omitted from structured data.
- No approved standalone logo URL was available, so Organization `logo` is omitted rather than guessed.
- Meaningful project case studies need verified scope, client/publication permission, design narrative and outcomes before individual project pages should be indexed.
- Search Console historical URL data should be reviewed to complete the migration map after access is available.
