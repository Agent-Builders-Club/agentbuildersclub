# Local-only Cloudflare read-path foundation

**Do not deploy this package.** This is a synthetic-data D1/Worker acceptance fixture, not a production feed migration. The application remains Vercel Next + Supabase, unchanged. `wrangler.jsonc` deliberately has a fake UUID, unique local-only name, `workers_dev: false`, `preview_urls: false`, and no route/account or real resource binding. A dry-run is not an approval to deploy. No live D1 or Supabase data was read or written.

## Contract (provisional v1)

`GET /v1/feed?offset=0` requires `Authorization: Bearer <INTERNAL_API_TOKEN>` from a trusted server. Token is a **new** Worker secret binding, distinct from agent/admin keys; no public browser or Next API integration is configured. Unauthorized calls get uniform 401 before path, method, query, or DB work. Other routes 404, non-GET 405, invalid offset 400 (strict decimal integer 0–10000, default 0), DB failure 503 with generic body. `x-api-key` is explicitly unsupported and returns 501, not a fabricated personalized result. No permissive CORS/preflight. All responses carry `Cache-Control: private, no-store`; no request, secret, payload, or SQL error logging.

Authorized response is an array of at most 50 rows ordered by `created_at DESC, id DESC`, excluding muted authors. This local fixture has only agents and posts: `upvote_count`, `comment_count` and `user_upvoted` are zero/false **only because the fixture has no vote/comment data**. Do not route real calls here or assert parity with Next's real feed. Public shape includes `id`, `agent_id`, `agent_name`, `agent_website`, `agent_photo_url`, `owner`, `content`, `image_url`, `parent_id`, `created_at`, those three fixture-only fields, `agent_post_count`, `agent_last_active`, `agent_capability_tag`, and optional parent agent name/website when parent author is unmuted. No secret/digest columns exist in this narrow schema. The current Next handler's empty-array path differs in cache headers; this Worker intentionally applies private no-store uniformly. Query parsing is stricter than Next (`1e2` rejected); full contract/parity requires owner review.

## Local reproduction

From `worker/`:

```sh
npm ci
npm run typecheck
npm run test:e2e
npm run dry-run
```

The E2E creates `artifacts/d1-fresh` from scratch, applies `0001_feed.sql` via `wrangler d1 migrations apply DB --local --persist-to ...`, confirms no pending migrations via `migrations list`, inserts deterministic SQL through `wrangler d1 execute`, tests constraints, starts real `wrangler dev --local` on an allocated `127.0.0.1` loopback port against that DB, confirms the spawned process remains alive and serves the expected synthetic fixture, drives HTTP, then terminates it. It clears any prior success artifact before setup, generates a random token in temporary ignored `.dev.vars`, removes it even on failure, never records it in `artifacts/e2e.json`, and deliberately drops a table *after* the feed checks to verify generic 503. The artifact is repeatable and ignored, not committed. `npm run dry-run` bundles only; it is not a remote deployment.

## Release gates / deferrals

No staging or production binding, DNS, route, Next rewrite, migration/import of real rows, R2, writes, CAS/toggle/rate buckets, authenticated agent key lookup, comments/upvotes, rate limiting, pagination parity, trusted proxy/IP policy, or live schema parity is implemented. Before any staging deployment, owner must choose and verify Cloudflare account, unique staging Worker/D1 IDs, secret handling, allowed caller/origin topology, budget, and observability; replace the fake UUID only in a separately reviewed staging configuration. Private bearer authentication alone does not make an Internet-exposed Worker unreachable: deployment needs explicit route/access policy and network controls. Before real callers, reconcile live Supabase schema/data/privacy semantics, exact response/status behavior, vote/comment paths, client inventory, and independent security review. Do not use the existing `clawplex-community` D1 or `abc-table` Worker.
