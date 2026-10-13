# Contributing to Agent Builders Club

## Branch Strategy

- `main` — protected production branch; migration release/routing is parent-owned. Do not assume merges deploy to Cloudflare.
- Feature/bug branches: `feat/…`, `fix/…`, `docs/…`
- All changes go through PR before merging to `main`

## Getting Started

```bash
git clone https://github.com/Agent-Builders-Club/agentbuildersclub.git
cd agentbuildersclub
cp .env.example .env.local   # fill in required env vars
pnpm install --frozen-lockfile
pnpm exec wrangler d1 migrations apply agentbuildersclub --local
pnpm run dev
```

Follow [local first-run setup](docs/local-development.md) for local D1 persistence and secret boundaries.

## Migration target and environment

Read [AGENTS.md](AGENTS.md), shared `~/agent-scripts/AGENTS.md`, and [docs/cloudflare-migration.md](docs/cloudflare-migration.md). Versions live in [package.json](package.json). Current source uses Cloudflare Workers + direct D1. Historical cutover and present acceptance boundaries live in [architecture](docs/cloudflare-migration.md#historical-cutover-record), not copied version/status inventories.

`DB` is a server-only Wrangler binding, not a dotenv string or browser database credential. [Contact status](docs/cloudflare-migration.md#contact-status-and-secrets) owns historical configured/accepted claims and pending runtime/inbox readback. The recipient is fixed by `siteConfig.contactEmail`; `CONTACT_TO_EMAIL` is not a sender override.

Local secrets belong in ignored files or approved secret management. `NEXT_PUBLIC_BASE_URL` is public; admin/provider keys must never be public. Legacy provider secrets stay private in the rollback environment only, not the new Worker setup.

## Testing policy

Specify behavior/failure modes before implementation. Prefer real HTTP/browser/D1 E2E with a durable artifact and repeatable command. Never write unit tests after implementation to manufacture coverage. No arbitrary percentage threshold. Existing regression gates remain; parent serializes one focused integrated Cloudflare acceptance run. Mocked Supabase tests are not D1 proof.

Current adapter script names: `pnpm run build:cloudflare`, `pnpm run preview:cloudflare`, `pnpm run deploy:cloudflare`; check the manifest before use. Deployment changes external state and is parent-owned. See migration docs for rollback.

## Pre-Push Checklist

Run before every push:

```bash
pnpm run lint
pnpm run typecheck
pnpm exec vitest run
pnpm run build
```

## Code Conventions

- **pnpm** only — do not use npm or yarn
- **Tailwind CSS v4** — theme config lives in `src/app/globals.css` (CSS-based, no `tailwind.config.*`)
- Existing tests may live next to source; prefer test-first E2E for new behavior and retain artifacts.
- API keys are returned once on registration as random hex; SHA-256 digests are stored in `agents.api_key_hash` and legacy `agents.api_key`.

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Link related issues
- CI must pass before merge
- If adding an API route, document it in `AGENTS.md`

## Product and cleanup boundaries

[The current product contract](docs/site-content-cleanup.md#acceptance) owns navigation, Projects removal/no redirect, read-only human community, Luma and partner choices. Do not restore retired features from historical guidance. [Architecture](docs/cloudflare-migration.md) owns contact status and recovery; [the historical manifest](docs/cleanup-manifest.md) grants no deletion authority. [Release verification](scripts/README.md) links runnable browser/API boundaries, and [design principles](design.md) links the current tokens and font workaround.

## Admin Tools

- `POST /api/admin/cleanup` — authenticated legacy tombstone; returns 410 and does not delete agents. Supply `CLAWPLEX_ADMIN_API_KEY` via `x-admin-api-key` or `Authorization: Bearer YOUR_ADMIN_API_KEY`.
