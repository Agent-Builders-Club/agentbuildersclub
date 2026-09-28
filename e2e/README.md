# Production-server browser E2E (first slice)

Run from a clean checkout with Node and pnpm 9:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm run test:e2e
```

`test:e2e` rejects `.env*` files (except `.env.example`) and environment variables named for Supabase, `DATABASE_URL`, or either admin credential (`CLAWPLEX_ADMIN_API_KEY` / `CLAWPLEX_ADMIN_SECRET`) **before** building. It removes previous `manifest.json` and `results.json` even when the guard blocks the run, so a prior pass cannot be mistaken for the current result. It builds Next and launches `next start` on 127.0.0.1:3217 (never reuses a preexisting server), runs Chromium desktop and Pixel 5 emulation serially, then writes `artifacts/e2e/manifest.json`, `results.json`, per-test traces and explicit `events.png`/`skills-dialog.png` screenshots. The artifact directory is ignored; retain it from CI if needed. `pnpm exec playwright show-trace artifacts/e2e/results/<test>/trace.zip` opens a trace. No snapshots are committed.

To recheck the credential guard without a real secret or a production build, run this from the repository root. Each canary must exit at the guard and remove planted stale success reports:

```sh
node --input-type=module -e '
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
const dir = "artifacts/e2e";
mkdirSync(dir, { recursive: true });
for (const name of ["CLAWPLEX_ADMIN_SECRET", "CLAWPLEX_ADMIN_API_KEY", "SUPABASE_SECRET_KEY", "DATABASE_URL"]) {
  writeFileSync(`${dir}/manifest.json`, JSON.stringify({ result: "passed" }));
  writeFileSync(`${dir}/results.json`, JSON.stringify({ status: "passed" }));
  const run = spawnSync(process.execPath, ["scripts/run-e2e.mjs"], {
    env: { ...process.env, [name]: "fake-e2e-canary-not-a-secret" },
    encoding: "utf8", timeout: 10000,
  });
  const output = run.stdout + run.stderr;
  if (run.error || run.status !== 2 || !output.includes(name) ||
      /Creating an optimized production build|E2E manifest:/.test(output) ||
      existsSync(`${dir}/manifest.json`) || existsSync(`${dir}/results.json`)) {
    throw new Error(`guard failed for ${name}: status=${run.status} error=${run.error} output=${output}`);
  }
  console.log(`${name}: blocked before build; stale reports removed`);
}
'
```

The browser intercepts `/api/skills` with two deterministic rows, aborts other browser API calls, and stubs Luma iframe HTML. The actual built HTML/JS and route handlers for SEO/redirect/404 are exercised against `next start`. Luma content is **not** verified. No Supabase credentials, live writes, local Postgres schema, auth/RLS, or database parity are involved. Community registration/feed/post/upvote, contact, RSVP, skill submit, and their failure modes remain outside this first slice. No coverage percentage or 75% target is claimed; prior measured server line coverage was 24.05% and this browser suite is not an instrumented coverage run.

The base branch has not merged UI PRs #24/#29/#30. The home skip target is checked only where the current base actually has `#main-content`; do not expand it to all pages or assert revised mobile/accessibility behavior until those changes are integrated. A future DB-backed E2E should use a disposable Supabase-compatible local stack and migrations, not a mocked API mislabeled as route-handler/database coverage.
