# ABC cleanup manifest — historical review only

This is the pre-cutover candidate review recorded in migration commit `a840b85` (2026-10-10). Every candidate/pending statement below describes that historical review, not present inventory or a fresh instruction. Later source cleanup and provider operations are recorded separately in [architecture/cutover history](cloudflare-migration.md#historical-cutover-record). Read current [product boundaries](site-content-cleanup.md#acceptance) and [release verification](../scripts/README.md) instead of replaying this list. Exact private receipts, not this table, establish completed provider operations and approval. Existing historical text is preserved as evidence; no candidate creates current deletion authority.

**No files, data or provider resources have been deleted by this documentation task. This is not approval to delete them.** Scope is `/home/tyler/agentbuildersclub-migration` unless a provider resource is explicitly named. Every destructive action needs exact owner approval after runtime cutover and recovery are verified. Use `trash`, not `rm`, for approved local deletion. Do not apply this manifest to the original dirty checkout or Encounter.

## Exact source candidates

| Exact path / directory | Proposed disposition after approval | Gate / reason |
|---|---|---|
| `supabase/.temp/` | Remove tracked local CLI metadata | Machine/project-linked state; not a reliable provider inventory. Includes `cli-latest`, `gotrue-version`, `pooler-url`, `postgres-version`, `project-ref`, `rest-version`, `storage-migration`, `storage-version`. Do not publish their values. |
| `supabase/migrations/` | Archive privately or retain as clearly historical; remove only if approved | PostgreSQL history/rollback evidence. **Not** new D1 migrations. Preserve source schema/data recovery first. |
| `src/lib/supabase.ts` | Remove after direct D1 integration and import scan | Legacy application client; no live call path may remain. Retain original deployment rollback separately. |
| `worker/` | Archive historical synthetic/private Worker foundation, then remove if approved | Full directory including source/tests/migrations/config/package files. Not the new Next Worker. Preserve evidence first; never use synthetic schema to replace production D1. |
| `.github/workflows/worker-foundation.yml` | Retire after historical `worker/` suite is archived | Synthetic local foundation CI, not unified app acceptance. Parent owns CI changes. |
| `force-deploy.txt` | Remove if owner confirms no deployment integration consumes it | Legacy deploy trigger marker, not Cloudflare configuration. |
| `scripts/api-db-e2e.mjs` | Replace/retire only after equivalent retained boundaries are covered on actual D1 | Legacy Supabase/PostgREST runner; parent owns regression transition. |
| `scripts/test-database.sql` | Archive/retire with PostgreSQL-only runner | Historical disposable database setup; not production cleanup SQL. |
| `src/app/api/rsvp/route.ts` | Keep explicit retirement/tombstone or remove only after compatibility review | RSVP is Luma-only. Preserve existing private RSVP separately. |
| `src/app/api/rsvp.test.ts` | Replace/retire stale implementation-specific assertions | Do not add after-the-fact units; retain predeclared retirement behavior in focused E2E. |
| `src/app/api/community/personal-posts/route.ts` | Keep tombstone or remove after compatibility review | Retired personal-post API, not community feed posts. |
| `src/app/api/community/personal-posts/[agentId]/route.ts` | Keep tombstone or remove after compatibility review | Retired personal-post API. Do not remove retained `/posts/by-agent/[agentId]`. |
| `supabase/migrations/001_create_subscribers.sql` | Historical archive only, not active feature guidance | Subscriber/newsletter retired; no standalone newsletter API file found in this source inventory. |
| `supabase/migrations/005_create_skill_executions.sql` | Historical archive only | Skill execution retired; no standalone execution API file found. Skills list/submit/moderate/export remain. |
| `supabase/migrations/008_create_personal_posts.sql` | Historical archive only | Personal posts retired; preserve historical data privately. |
| `.well-known/agents.json` | Review/update or remove only if no root-level integration consumes it | Root metadata is separate from the served `public/.well-known/` discovery files; serving/consumer status is unverified. |

## Exact docs/config/package references to reconcile (not blanket deletion)

| Path / manifest entry | Required action |
|---|---|
| `package.json`: `@supabase/supabase-js`, `@vercel/analytics` | Parent removes only when no runtime imports remain; regenerate `pnpm-lock.yaml` through pnpm. No manifest/lock edits were made in this lane. |
| `package.json`: `shadcn` | Evaluate CLI vs runtime dependency; not proven unused and not automatically removable. |
| `next.config.mjs` | Parent reviews legacy Supabase image origins after real-row media-origin inventory. External images are not proof of a removable storage service. |
| `.github/workflows/ci.yml` | Parent reconciles PostgreSQL-only jobs and target Cloudflare build/acceptance, without silently dropping retained API contracts. |
| `scripts/README.md` | Update legacy database runner/setup instructions after parent settles scripts. |
| `e2e/API_DB.md` | Update legacy disposable Postgres/Supabase setup to target acceptance; keep historical evidence clearly marked if useful. |
| `e2e/README.md` | Reconcile runtime/commands/artifact instructions against final integrated runner. |
| `docs/dependency-advisories.md` | Refresh historical versions/security claims from actual final audit; do not treat old zero-advisory results as current evidence. |
| `skills/SKILL.md`, `skills/community-post.md`, `skills/community-register.md`, `skills/skill-submit.md` | Reconcile old brand/URLs, registration/required fields, daily policy and API contracts. **Retain community skills**; not owned by this documentation lane. |
| `src/app/privacy/page.tsx`, `src/app/terms/page.tsx` | Frontend owner verifies hosting/data/contact/moderation and retired-feature claims against actual release. |
| `src/components/agent-readiness/json-ld-schemas.ts`, `src/app/robots.ts`, `src/app/sitemap.ts` | Frontend owner reconciles discovery/canonical/contact URLs and route coverage. Do not delete. |
| `src/app/api/community/agents.test.ts`, `src/app/api/community/feed.test.ts`, `src/app/api/community/preview.test.ts`, `src/app/api/community/register.test.ts`, `src/app/api/community/upvote/[postId].test.ts`, `src/app/api/community/admin/admin-routes.test.ts`, `src/lib/community-db.test.ts`, `src/app/api/contact.test.ts`, `src/app/api/security-routes.test.ts` | Existing regression files may contain mocked/legacy Supabase assumptions. Review individually after backend stabilizes; no blanket removal or coverage fabrication. |

Active README/AGENTS/CONTRIBUTING/.env.example, `/llms.txt`, and served discovery metadata were updated in this lane. Parent must reconcile pending backend/provider names and exact route statuses/methods before publication. New active `d1/`, root `wrangler.jsonc`, `open-next.config.ts`, and direct-D1 helpers are **not cleanup candidates**.

## Provider resources — no destruction approved

| Exact known target / identity | Required next evidence |
|---|---|
| New D1 `agentbuildersclub` / `936b6758-b673-459f-8c22-eb79f7fff25c`; root Worker `agentbuildersclub` | **Keep**. Verify deployed version/bindings/data under parent-owned release. |
| Historical staging Worker `abc-feed-staging-20260929`; D1 `abc-staging-20260929` / `58520610-7890-4fbe-92ac-a5e987148e83` | Removal candidate only after account inventory proves exact identity, ownership and no consumers. Local config is not deployment existence proof. |
| ABC Vercel project/deployments | Identity/IDs still require authorized account inventory. Preserve recoverable old deployment and routing until D1 delta-safe rollback is proven; request exact deletion scope later. |
| ABC Supabase project/database/storage | Exact hosted project identity and media dependencies still require private account/data inventory. Preserve private rows/backups/keys and all retained relationships. No table/storage/project deletion authorized. |
| Legacy ABC DNS/domain routing | Record exact old routing and new tested deployment; do not delete routing/account resources as documentation cleanup. |
| Encounter / Encounter Blob | **Excluded. Do not modify or delete.** User-reported size is not an ABC resource inventory. |

No free-plan/billing status is inferred from a source config. Pause for billing activation. No R2 or invented object-storage migration.

## Approval and verification record (parent fills at release)

For each approved operation record: exact path or provider resource ID, owner approval, action, prerequisite recovery evidence, exact command/API target, outcome, and readback verification. Keep secret/private values out of public artifacts. Until these records exist all items remain pending review, not performed cleanup.

Rollback: [cloudflare-migration.md](cloudflare-migration.md#data-conservation-and-recovery). Once D1 accepts writes, preserve/reconcile its accepted delta before restoring legacy writes; a routing flip alone is not data-safe recovery.
