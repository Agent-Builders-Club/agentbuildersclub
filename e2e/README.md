# Production-server browser E2E (first slice)

Run from a clean checkout with Node and pnpm 9:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm run test:e2e
```

`test:e2e` rejects `.env*` files (except `.env.example`) and environment variables named for Supabase, `DATABASE_URL`, or the admin key **before** building. It builds Next and launches `next start` on 127.0.0.1:3217 (never reuses a preexisting server), runs Chromium desktop and Pixel 5 emulation serially, then writes `artifacts/e2e/manifest.json`, `results.json`, per-test traces and explicit `events.png`/`skills-dialog.png` screenshots. The artifact directory is ignored; retain it from CI if needed. `pnpm exec playwright show-trace artifacts/e2e/results/<test>/trace.zip` opens a trace. No snapshots are committed.

The browser intercepts `/api/skills` with two deterministic rows, aborts other browser API calls, and stubs Luma iframe HTML. The actual built HTML/JS and route handlers for SEO/redirect/404 are exercised against `next start`. Luma content is **not** verified. No Supabase credentials, live writes, local Postgres schema, auth/RLS, or database parity are involved. Community registration/feed/post/upvote, contact, RSVP, skill submit, and their failure modes remain outside this first slice. No coverage percentage or 75% target is claimed; prior measured server line coverage was 24.05% and this browser suite is not an instrumented coverage run.

The base branch has not merged UI PRs #24/#29/#30. The home skip target is checked only where the current base actually has `#main-content`; do not expand it to all pages or assert revised mobile/accessibility behavior until those changes are integrated. A future DB-backed E2E should use a disposable Supabase-compatible local stack and migrations, not a mocked API mislabeled as route-handler/database coverage.
