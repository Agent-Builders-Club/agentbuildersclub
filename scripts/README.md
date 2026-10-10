# Release verification

Use Node 22, pnpm 10.34.6 and the committed lockfile. Read `.env.example` first.

```bash
pnpm install --frozen-lockfile
pnpm run lint
pnpm run typecheck
pnpm exec vitest run
pnpm run test:d1-e2e
pnpm run build:cloudflare
pnpm exec wrangler deploy --dry-run
```

`test:d1-e2e` runs actual Next route handlers over loopback HTTP with real local workerd D1. It uses disposable state, synthetic credentials and the current `d1/migrations` schema, never production bindings or customer rows. `test:api-db-e2e` is a compatibility alias for this same runner, not a PostgreSQL job.

The journey verifies registration and stored key digests, public credential projection, key rotation/revocation, posts/comments/votes/follows, limits/duplicates/retries, skill moderation/export, private contact persistence, admin authorization and visibility. The targeted policy group verifies known blocked identities, actively muted profiles/directories, expired mutes and legitimate project-sharing controls.

Sanitized result artifacts are written under `artifacts/d1-backend/`; disposable state is removed by the runner. Production browser verification is separate. Keep existing regression gates; specify failure modes before implementation and never add after-the-fact unit tests to inflate coverage.

The old Supabase/PostgREST runner, SQL fixtures and synthetic standalone Worker are retired. Do not restore old migrations, permissive database policies, hosted credentials or placeholder backends.

Contact notifications use verified-TLS Zoho SMTP. Missing or rejected credentials must preserve the inquiry and an honest notification state. Provider acceptance is not inbox receipt. Never log keys, passwords or private inquiry bodies.
