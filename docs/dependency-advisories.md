# Dependency advisory remediation

Historical baseline: `pnpm audit --json` on `6ed4d8f` reported **29 advisory records** (17 high, 15 moderate, 3 low vulnerability findings; some records have multiple affected installed versions). The cleaned `d478c22` main baseline reports **28 records** (16 high, 14 moderate, 3 low findings). This branch reports **0 records / 0 findings** on the combined graph. None were suppressed or dismissed.

The paths below are the affected dependency roots (`pnpm why` and `pnpm-lock.yaml`); “production” means classified under `dependencies`, not necessarily executed by the web server. In particular, `shadcn` is a CLI currently listed as a production dependency. The updates stay on the existing release lines; sharp's 0.x minor change is separately justified by Next's published compatibility range below. Version-scoped overrides apply only to the old installed version; Vite is a direct dev dependency so its peer consumers resolve the same patched version.

| Package (before → after) | Dependency path and scope | Advisory IDs addressed |
| --- | --- | --- |
| `vite` 8.0.3 → 8.0.16 | `vitest`, `@vitest/mocker`, `@vitejs/plugin-react` → Vite; dev | GHSA-4w7w-66w2-5vf9, GHSA-v2wj-q39q-566r, GHSA-p9ff-h696-f583, GHSA-v6wh-96g9-6wx3, GHSA-fx2h-pf6j-xcff |
| `@hono/node-server` 1.19.12 → 1.19.15 | `shadcn` → `@modelcontextprotocol/sdk` → node-server; production CLI | GHSA-92pp-h63x-v22m, GHSA-frvp-7c67-39w9 |
| `postcss` 8.4.31 / 8.5.8 → 8.5.28 | `next` → PostCSS; `shadcn` → PostCSS; `@tailwindcss/postcss` → PostCSS (dev); also Vite's PostCSS already at 8.5.28 | GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849 |
| `ip-address` 10.1.0 → 10.3.1 | `shadcn` → `@modelcontextprotocol/sdk` → `express-rate-limit` → ip-address; production CLI | GHSA-v2v4-37r5-5v8g, GHSA-mwp4-54f8-5fhr |
| `ws` 8.20.0 → 8.21.0 | `@supabase/supabase-js` → `@supabase/realtime-js` → ws; production | GHSA-58qx-3vcg-4xpx, GHSA-96hv-2xvq-fx4p |
| `qs` 6.15.0 → 6.16.0 | `shadcn` → `@modelcontextprotocol/sdk` → `express` / `body-parser` → qs; production CLI | GHSA-q8mj-m7cp-5q26, GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g |
| `@babel/core` 7.29.0 → 7.29.6 | `shadcn` → `@babel/preset-typescript` → Babel core/peer plugins; production CLI | GHSA-4x5r-pxfx-6jf8 |
| `body-parser` 2.2.2 → 2.3.0 | `shadcn` → `@modelcontextprotocol/sdk` → `express` → body-parser; production CLI | GHSA-v422-hmwv-36x6 |
| `sharp` 0.34.5 → 0.35.4 | `next` → sharp (optional image optimizer); production | GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c |
| `nanoid` 3.3.11 → 3.3.19 | `next` / `shadcn` / `@tailwindcss/postcss` → PostCSS → nanoid; production + dev | GHSA-28wg-ghj8-5hjv, GHSA-2v37-7h3g-55p8, GHSA-xwg4-73v4-xw9w |
| `postcss-selector-parser` 7.1.1 → 7.1.3 | `shadcn` → postcss-selector-parser; production CLI | GHSA-w9m9-85wc-3x92 |
| `browserslist` 4.28.2 → 4.28.7 | `shadcn` → browserslist, and `@babel/core` → `@babel/helper-compilation-targets` → browserslist; production CLI | GHSA-c83g-rgw3-j3cx, GHSA-73wf-gq98-2v4g |
| `@humanfs/node` 0.16.7 → 0.16.8 | `eslint` → @humanfs/node; dev | GHSA-p498-v437-472g |

Compatibility: the published `next@15.5.26` metadata allows optional `sharp: ^0.34.3 || ^0.35.4` (verified with `pnpm view next@15.5.26 optionalDependencies --json`), so the sharp override selects a **declared compatible** release rather than forcing a version outside Next's range. The production Next image endpoint returned HTTP 200 with PNG bytes using this combination. The `postcss` 8.5.28 override changes Next's pinned 8.4.31 within the same PostCSS major; production build and browser E2E passed. Vite 8.0.16 supports the project's Node 22 runtime (`^20.19.0 || >=22.12.0`). No Next major upgrade is required for these lockfile advisories.

Verification: `pnpm install --frozen-lockfile`, formatting, ESLint, TypeScript, 91 Vitest tests, coverage baseline (64 tracked production files; 194/1223 lines), Next production build, and 12 Playwright production-browser cases passed on the combined `cb49c47` base. The production Next image endpoint returned HTTP 200 with PNG bytes. This does not assert coverage of real database, all image formats, or all third-party flows.
