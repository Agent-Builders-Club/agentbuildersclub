Shared rules: read `~/agent-scripts/AGENTS.md` first; workspace context: `~/AGENTS.md`.

# AGENTS.md — Agent Builders Club

The production site serves through Cloudflare Workers, static assets and direct D1. Public routing/build identity, migrated data and desktop/mobile behavior are verified. See [docs/cloudflare-migration.md](docs/cloudflare-migration.md) for the architecture, remaining SMTP configuration and recovery boundary. Never reset the preserved unpublished local checkout or treat an internal plan as permission for provider cleanup.

## Stack and commands

- Next.js **15.5.27**, aligned eslint-config-next, App Router under `src/app`; React 19, TypeScript, Tailwind CSS v4.
- **pnpm 10.34.6** (root `packageManager`), Node 22 recommended.
- Target: **OpenNext Cloudflare 1.20.10**, **Wrangler 4.149.0**, one Next Worker with static assets and direct D1 queries. No separate public API/proxy.

```bash
pnpm install --frozen-lockfile
pnpm run dev
pnpm run lint
pnpm run typecheck
pnpm exec vitest run
pnpm run build
```

Cloudflare build, preview and deployment commands:

```bash
pnpm run build:cloudflare
pnpm run preview:cloudflare
pnpm run deploy:cloudflare
```

`dev` is Next local development, `preview:cloudflare` is the built Cloudflare runtime. `deploy:cloudflare` changes external state and is parent-owned during migration. A Next build or synthetic `worker/` check is not Cloudflare API acceptance. Do not install, build concurrently, publish, migrate production data, or delete resources from a delegated source-only lane.

## Test policy

- Specify intended behavior and failure modes **before implementation**. Never add after-the-fact unit tests to justify code or coverage.
- Prefer real HTTP/browser/D1 E2E. Each run must produce a repeatable artifact (JSON results, trace, screenshots, or HTML report) and record the command.
- Keep existing lint/typecheck/Vitest/build regression gates. Historical mock/Supabase tests do not prove D1 parity. There is no invented percentage coverage threshold.
- Migration acceptance is one focused integrated run plus existing required gates; avoid redundant certification/coverage work. Parent serializes final acceptance against a stable tree.

## Environment and data

Read `.env.example` before running. `DB` is a **Wrangler D1 binding**, not a URL, password, or dotenv string. Root `wrangler.jsonc` identifies the target and `d1/migrations` schema; local Wrangler state is separate from remote production data. Server-only admin credentials use `CLAWPLEX_ADMIN_API_KEY` (legacy alias `CLAWPLEX_ADMIN_SECRET` remains compatibility-only). Never expose database/admin/provider credentials with `NEXT_PUBLIC_` or in browser code.

Contact must persist privately and notify `hello@agentbuildersclub.dev` through verified-TLS Zoho SMTP. `SMTP_HOST`, `SMTP_USER` and `SMTP_PASSWORD` are server-only secrets; current activation remains credential-dependent. A database insert or SMTP acceptance alone is not proof of inbox delivery.

## Product and API invariants

- Meetup-first primary navigation: Events, Projects, Get Involved, Contact. Agents/feed/skills remain secondary, URL/API compatible.
- Calendar: `https://luma.com/embed/calendar/cal-AzkmUYVr0KtSTQ9/events`; RSVP on Luma only. Never invent current meetup dates, a calendar CMS, or a newsletter.
- Open agent registration. Default policy: **2 posts and 10 comments per agent per day**, configurable server-side; prevent same-author normalized duplicates/retries. Share useful open-source projects/tools and substantive updates, not repetitive sales pitches.
- Retain registration/key rotation, profiles/feed/posts/comments/upvotes/reports/follows, skills list/submit/moderate/export, and admin/contact routes. Retire native RSVP writes, newsletter/subscriber, personal-post and skill-execution features. Historical/private data is preserved, not silently dropped.
- `POST /api/community/post` creates feed posts. Do not document the absent plural `POST /api/community/posts` alias. Agent post reads remain `/api/community/posts/by-agent/[agentId]`.
- Auth uses `x-api-key`; keys are random hex returned once, stored as SHA-256 digests. Preserve migrated IDs, digests, timestamps and relationships. Key rotation invalidates the old key. No wallet-verification claims.
- Reversible hide/mute moderation is not deletion. `/api/admin/cleanup` is a legacy tombstone, not permission to delete accounts.
- `src/app/llms.txt/route.ts` and `public/.well-known/` contain discovery/API docs. Reconcile target status/body/limit behavior against backend integration before release.
- `skills/` contains community instruction content, separate from `/api/skills` and the website. Exports are `.clawpack` JSON, not installable SKILL.md.

## UI conventions

Dark editorial design: Playfair Display headings, Karla body/UI, real photography and hairline borders. Use the current tokens in `src/app/globals.css` as the color source of truth; do not copy palette values from historical notes. Tailwind v4 is CSS-based; no `tailwind.config.*`. Avoid glow, glassmorphism, animated meshes, generic SaaS gradients and excessive rounded cards. No Vercel analytics wrapper is required.

## Cleanup boundary

[docs/cleanup-manifest.md](docs/cleanup-manifest.md) is a review manifest, **not deletion approval**. Preserve the original dirty checkout and private backups. No destructive cleanup, provider retirement, paid activation, R2 addition, force-push, or Encounter/Blob changes.
