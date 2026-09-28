# OpenNext / Next 16 Cloudflare frontend staging adapter (local-only)

## Verdict: PARTIAL — local frontend runtime works, parity unproven

On the security-remediated Next 16.3.6 graph, OpenNext Cloudflare 1.20.6 and Wrangler 4.142.0 build a Worker bundle **with webpack** and serve static/SSR shell routes in local Wrangler. This is not approval for deployment or a backend migration. The live site remains Vercel/Supabase; no Cloudflare resources, DNS, deploy or production credentials were used. This staging adapter is not connected to the separate local-only `worker/` D1 foundation.

## Reproduce (credential-free checkout)

```sh
pnpm install --frozen-lockfile
mkdir -p artifacts/opennext
pnpm audit --json > artifacts/opennext/audit.json
pnpm run test:cf-credentials
pnpm run build # ordinary default Turbopack / Vercel path
pnpm run build:cf
node scripts/spike-opennext.mjs
pnpm run format:check && pnpm run lint && pnpm run typecheck
pnpm exec wrangler deploy --dry-run --outdir artifacts/opennext/dry-run
```

`build:cf` first refuses every local `.env*` file (except the inert `.env.example`) and `.dev.vars*` file, including `.env.production.local`, and inherited Supabase, database, admin, and resend credential variable names. The same guard runs before direct `pnpm run preview:cf` and preview smoke. Refusals log names only, never values; the synthetic regression test exercises both file and process-environment refusal without live credentials. CI runs these existing guard checks via `pnpm run test:cf-credentials` independently of the ordinary Next build. The smoke binds preview to loopback, aborts external/browser API requests, shuts down its server, and writes `artifacts/opennext/smoke.json`, `preview.log`, and `home.png`. Run from a credential-free shell and checkout; ordinary `pnpm run build` is unchanged and does not run this guard. The dry-run is packaging only; **do not run `deploy`, `upload`, or `migrate`** from this prototype. `worker/` is a separate local-only D1 foundation and is not wired to this frontend.

## Observed

- Standard Turbopack `opennextjs-cloudflare build` fails after Next compilation at `@opennextjs/aws/dist/build/copyTracedFiles.js:143`: `File server/middleware.js does not exist`. Next 16's Turbopack output includes a middleware trace but no standalone middleware file. The scoped build wrapper uses `next build --webpack` only when `OPENNEXT_CLOUDFLARE_BUILD=1`; ordinary `pnpm run build` still selects Next's default.
- Webpack adapter build passed, creating `.open-next/worker.js`. Wrangler local preview passed homepage/events HTML, robots, sitemap, llms, 404, legacy-host 308, image transformation of `/hero-lobster.webp`, and Chromium home + client navigation with no page errors. Artifacts are generated locally and ignored.
- `wrangler deploy --dry-run` succeeded: 192 assets, Worker gzip 1470.54 KiB. This only establishes packageability, not Cloudflare deployment or free/paid quota fit in all contexts.
- Without database bindings/credentials, `/api/skills` returns 500 (`{"error":"Server error"}`), explicitly checked by the smoke; this is **not backend parity**. The local image binding processed a public file; remote-origin transforms, billing and account configuration are untested. An app-route `/icon.png` does not work as an image optimizer upstream (404), whereas a public image does.
- The merged security override set (including `sharp@0.34.5` to `0.35.5`) and patched Tailwind remain in `package.json`/the regenerated lockfile. Frozen install and `pnpm audit --json` passed with zero info/low/moderate/high/critical advisories; the normal build remained Turbopack, whereas only the adapter build selected webpack. CI retains Actions checkout/setup-node v7 and runs the guard independently.
- `pnpm run lint`, `pnpm run typecheck`, and `git diff --check` passed after excluding generated `.open-next` from ESLint.

## Production/staging prerequisites not exercised

- Current server routes use Supabase. Migration requires an explicit backend contract, D1 schema/data strategy, auth/RLS and admin isolation review; the separate `worker/` D1 prototype is not a replacement. No real data or row-level export here.
- Environment names to inventory before isolated staging: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY` (fallback), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `CLAWPLEX_ADMIN_API_KEY`, `CLAWPLEX_ADMIN_SECRET` (fallback), `DATABASE_URL`, `RESEND_API_KEY`, `NEXT_PUBLIC_BASE_URL`. Do not copy production values into preview. The build currently prerenders public pages without these values; runtime APIs need backend bindings or isolated staging values.
- Configured local bindings: `ASSETS`, `WORKER_SELF_REFERENCE`, `IMAGES`. For durable ISR/revalidation, add and verify explicit cache bindings/config (typically `NEXT_INC_CACHE_R2_BUCKET`, cache queue and tag cache when required); current empty OpenNext config does not prove cache persistence. Cloudflare Images may incur costs.
- Vercel Analytics/Speed Insights remain in layout; their behavior on Cloudflare has not been validated. Third-party iframe/assets, dynamic profile/feed/API flows, admin authorization, image remote origins, cache revalidation and Cloudflare edge staging are out of scope.

Official references consulted: [OpenNext supported Next versions](https://opennext.js.org/cloudflare), [existing-app setup](https://opennext.js.org/cloudflare/get-started), [CLI preview](https://opennext.js.org/cloudflare/cli), [image binding](https://opennext.js.org/cloudflare/howtos/image), [cache components](https://opennext.js.org/cloudflare/caching). Cloudflare's [current Next guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) recommends beta vinext as the default path; this experiment intentionally isolates OpenNext rather than treating that recommendation as OpenNext parity.
