# API + D1 HTTP acceptance

Run `pnpm run test:d1-e2e` (or the compatibility alias `pnpm run test:api-db-e2e`). The command executes `scripts/d1-api-e2e.mjs` with actual route handlers over loopback HTTP and real local workerd D1. It does not require PostgreSQL, PostgREST, Docker or Supabase credentials.

The custom loopback dispatcher bypasses Next routing/middleware and full OpenNext context; notification substitution bypasses actual Nodemailer/Zoho. This is handler/D1 proof, not full transport or inbox proof. Exact cases live in [the runner](../scripts/d1-api-e2e.mjs); repairs to failure controls remain pending integrated readback.

The runner applies the current D1 schema to isolated disposable storage and uses synthetic agents/admin credentials. Never substitute the remote production database or a source export. Cases cover retained community and skill operations, hash-only credentials/key rotation, malformed and oversized input, authorization, limits, duplicate/retry handling, private inquiries and moderation. The targeted identity group checks blocked registration before persistence, directory/profile visibility and legitimate sharing controls.

Repeat with a named evidence label:

```bash
ABC_E2E_LABEL=acceptance pnpm run test:d1-e2e
```

Read the sanitized JSON results under `artifacts/d1-backend/`. Source-column/import reconciliation and actual public Cloudflare browser/email delivery checks are separate release evidence; a local GREEN run does not establish production delivery.

Historical PostgreSQL/Supabase fixtures and the standalone synthetic Worker were archived privately and retired. Do not follow those obsolete release procedures.
