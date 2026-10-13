# Release verification

Use Node 22 and pnpm as pinned in [package.json](../package.json). Read [.env.example](../.env.example). [Local first run](../docs/local-development.md) initializes ordinary development D1; isolated acceptance does not populate it. Install from the lockfile only in an authorized setup, never into shared read-only dependencies from a delegated lane.

## Required local gates

```bash
pnpm run lint
pnpm run typecheck
pnpm exec vitest run
pnpm run build
pnpm run test:d1-e2e
pnpm run test:duplicate-policy
pnpm run build:cloudflare
pnpm exec wrangler deploy --dry-run
```

Serial builds must use a stable integrated source tree. A dry run is a local bundle check, not deployment. [package.json](../package.json) owns scripts; [.github/workflows/ci.yml](../.github/workflows/ci.yml) owns CI selection. Do not claim manual cleanup/profile runners are selected by CI without verifying that file.

## Evidence boundaries

- [HTTP/D1 acceptance](../e2e/API_DB.md) uses actual handlers through a custom loopback dispatcher and real disposable workerd D1. Notification substitution means it does not exercise actual Nodemailer/Zoho; it also bypasses Next/OpenNext transport. Synthetic records cannot establish historical import/key parity.
- [Browser fixtures](../e2e/README.md) exercise the built Next app with intercepted skill/Luma data and intentionally limited scope. Fixture success does not prove real community/contact behavior or external calendar contrast.
- [Product cleanup contract](../docs/site-content-cleanup.md) has separate real read-only browser acceptance. Inspect the current runner and browser prerequisites. Live replay needs fail-before-forward blocking of same-origin API mutations, not merely a post-run observation.
- `pnpm run preview:cloudflare` exercises the compiled adapter. Actual public build/routes/data and resource diagnostics require parent-owned acceptance; a later 200 does not resolve the recorded intermittent Worker error 1102.

## Maintained compiled-Worker pipeline

`pnpm run build:cloudflare` builds OpenNext, runs the installed `populateCache local`
with binding-only [static-cache-local.json](static-cache-local.json), and checks every
current generated cache file against its ASSETS copy. A raw adapter build alone
emits `.open-next/cache` but does **not** populate ASSETS. The normal maintained
command (also used by maintenance and CI) now owns that step; no scratch-script or
manual population is required. `pnpm run build` is the separate Next-only build.

[open-next.config.ts](../open-next.config.ts) owns read-only Static Assets cache and
interception, with dummy tags/queue. [wrangler.jsonc](../wrangler.jsonc) routes only
`/cdn-cgi/_next_cache/*` through the Worker first. The adapter's built-in dummy
middleware asset resolver prevents re-exposing those cache files; public assets
remain asset-first and internal cache reads still use ASSETS. No ISR, R2/KV/DO,
new provider, remote database or dependency is added.

```sh
pnpm run test:maintenance
pnpm exec wrangler deploy --dry-run --outdir artifacts/worker-bundle
node scripts/canonical-cache-e2e.cjs
ABC_COMPILED_LABEL=captures ABC_COMPILED_CHILD=scripts/capture-ui-e2e.mjs node scripts/compiled-d1-e2e.mjs
```

Use credential-free local environments without `.env.local`/`.dev.vars` for
acceptance; the runners refuse provider credentials. Maintenance builds normally,
then owns the exact compiled Worker with full disposable D1 migrations/fixtures.
Its static gate probes all actual cache paths: public404/internal ASSETS200,
exact cached HTML/RSC/prefetch bytes, HEAD and native client navigation, and dynamic
profile/invalid-auth private policy. Existing D1/backend/UI/browser/cleanup/SSR
scopes remain intact. The normal maintenance/CI command also requires all 27 approved duplicate-policy HTTP/native D1 cases with synthetic migration preservation and notification-acceptance fixtures. [Forward migration and rollback constraints](../docs/cloudflare-migration.md#approved-duplicate-policy-forward-migration) apply. The extra source-closure browser contracts cover retired
comment requests and actual homepage JSON-LD. Capture uses full-schema profile
fixtures and all22 UI cases in both motion modes, retaining native content frames.

The canonical-host gate uses the packaged dry-run Worker and explicitly restores
only Host at local ingress because Wrangler rewrites Host to loopback. It does not
implement redirects or cache behavior. This is local evidence, not deployed edge
protection, paid/billed CPU or a production1102 fix. Keep failed receipts; never
retry full acceptance until an isolated failure is understood. Protected AGENTS
instruction-file approval remains unavailable to the attached app. Duplicate policies and release are user-approved; external release remains parent-owned.

## Durable acceptance artifacts

Retain sanitized machine-readable results and relevant traces/screenshots or HTML report. Bind every run to source revision/tree, runner/schema hashes, command, timestamp and local/runtime/public target; remote acceptance must include deployed identity. Artifact failure must also be recorded, not leave stale success reports. [The D1 runner](d1-api-e2e.mjs) and [browser runner](run-e2e.mjs) own artifact layout and exact cases.

Historical missing scratch runners/job receipts cannot be re-created as proof. Preserve historical results as revision-bound records; record missing provenance honestly. [Dependency advisory history](../docs/dependency-advisories.md) is not current audit status. Fresh advisory JSON and actual build-job receipts belong to the release evidence, without new dependency changes to chase counts.

## Release and data boundaries

Deployment/push/merge and reviewed data-preserving forward migrations are explicitly user-approved for this repair; the release owner executes them. Local policy acceptance is not remote migration or deployment. No paid activation, credential change or provider cleanup is implied. Capture schema/data boundaries before and after any approved migration and use [single-writer recovery](../docs/cloudflare-migration.md#data-conservation-and-recovery). Never use production mail credentials/rows as local fixtures.

Contact persistence, SMTP acceptance and inbox receipt are distinct. [Contact status](../docs/cloudflare-migration.md#contact-status-and-secrets) owns operational claims. Read-only metadata confirmation does not authorize retry, new inquiry or mail send.
