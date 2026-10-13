# Maintained ABC test entrypoints

Use Node 22 and the package's pinned pnpm 10.34.6. From a clean checkout:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm run test:runner
pnpm run test:e2e
pnpm run test:d1-e2e
```

`test:e2e` builds Next, starts an owned `next start` on `127.0.0.1:3219` (never reuses a server), and runs the default Playwright discovery. Desktop, 390px and 320px production cases remain selected; preview calculator preservation uses a single HTTP project. The maintenance project selects the repaired nav/home/events/footer/contact-UI standalone runners against that same built server. They retain focus/resize, photo decode, honest copy, exact public links, blocked/empty Luma fallback, native validation and offline draft assertions. These are not fixtures for production API/database behavior.

The runner refuses `.env*` except `.env.example`, `.dev.vars*`, Supabase/database/admin/SMTP/Cloudflare API variables before build. It preserves old results under timestamped `.previous-*` names and writes a current `blocked` manifest on guard/build failure. `--list` and `--pass-with-no-tests` are not acceptance modes. Empty, missing, failed or skipped execution reports fail the acceptance manifest. Vitest's default command also fails empty discovery.

Artifacts: `artifacts/e2e/manifest.json`, JSON results and per-test traces/screenshots/standalone reports; manifest includes selection, runner hash, timestamps and actual Next BUILD_ID. Use `pnpm exec playwright show-trace <trace.zip>` to inspect a trace. `test:runner` independently exercises credential guard canaries and a real disposable HTTP/browser write-prevention boundary; its native receipt and trace are under `artifacts/runner-safety/browser-boundary/`. CI preserves existing format/lint/typecheck/Vitest/coverage/Next/OpenNext/dry-run gates, adds runner safety, and selects all maintenance-project browser cases via the existing E2E job.

## Complete maintenance / real D1 cleanup

The consolidated local/release entrypoint builds OpenNext and owns a **disposable compiled serving runtime**, applies every checked-in D1 migration locally, and seeds synthetic agents/posts/comments/votes. It uses a generated scratch configuration without SMTP/provider secrets, remote databases or shipping test endpoints. It is not a production URL or a fake API:

```sh
pnpm run test:maintenance
```

It runs existing Vitest, runner safety, 13 production-route HTTP/workerd D1 groups, 14 backend repair contracts, 31 built Next browser executions, 22 UI repair contracts and real-data read-only cleanup/profile serially. Missing compiled runtime or policy-only D1 selection is BLOCKED, never skipped GREEN. Aggregate report is `artifacts/maintenance/results.json`; cleanup has 7 contracts at desktop/390/320 with traces/screenshots and exact response ID/count/comment/toggle assertions. The fixture separately preserves profile SSR/metadata, Jan2025 UTC/Chicago hydration, missing404/outage5xx, key nonleakage, keyboard skip and complete directory/comment continuation. A narrowed/manual read-only command is:

```sh
ABC_QA_URL=http://127.0.0.1:3249 ABC_QA_LABEL=local pnpm run test:cleanup-e2e
```

All repaired read-only runners launch declared Playwright Chromium, with optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` for a verified installed browser. They need no personal Chrome profile, DevToolsActivePort or CDP session. Their shared boundary blocks foreign traffic and **all same-origin non-GET/HEAD requests before forwarding**, not merely after-the-fact API observation. GET APIs remain real. Attempted writes/page errors fail assertions; service workers are blocked so they cannot bypass interception.

Both feed/profile cards and comment rows expose durable public `data-post-id` and `data-comment-id`. CI's E2E job invokes complete maintenance and retains its serving, cleanup, browser and D1 artifacts. Configuration is not a hosted CI pass receipt. The standalone fixture `node scripts/compiled-d1-e2e.mjs` requires the actual built OpenNext worker; explicit `--next-boundary` uses compiled Next with the supported SDK/local D1 proxy and is labelled separately. A Next fallback GREEN does not satisfy OpenNext acceptance.

## Contact write boundary

The contact runner defaults to `ui`. Its native validation/offline tests abort same-origin writes and preserve the draft; no inquiry is delivered. Full mode forwards only `POST /api/contact` to an explicitly owned disposable loopback D1/mail runtime and requires `ABC_CONTACT_DISPOSABLE=1`; real provider secrets remain forbidden. It uses actual `notification_status`, not obsolete receipt fields. It does not prove inbox delivery.

## Retained assertions and coverage limits

`evidence/tests/preservation-inventory.json` accounts for all 63 audited Vitest declarations. Copied Supabase/API handlers remain in the required gate until parent verifies production-HTTP transfers and explicitly retires their source-test files. Preview's eight unique calculator assertions now have a built-HTTP owner; D1 adds missing-binding/empty-directory, registration/contact validation, third vote toggle with exact durable count, quota row counts, restored visibility and winning-key authorization. The route harness exercises actual route modules and real local workerd D1; its custom dispatcher and substituted context/notification transport do **not** prove Next/OpenNext routing, middleware or SMTP.

Historical profile PostgREST runner is preserved and not selected; its surviving assertions now have a real migrated-D1 serving owner. Copied API test sources also remain: no deletion approval was granted. Their old content-word capability tags/name-only registration/last-active directory order are historical snapshots, not current API authority. No browser coverage percentage, physical-device accessibility, real Luma calendar/RSVP, live credentials, private inquiries or SMTP inbox acceptance is claimed.
