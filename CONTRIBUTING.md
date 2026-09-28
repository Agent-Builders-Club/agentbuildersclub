# Contributing to Agent Builders Club

## Branch Strategy

- `main` — production, protected, auto-deploys to Vercel
- Feature/bug branches: `feat/…`, `fix/…`, `docs/…`
- All changes go through PR before merging to `main`

## Getting Started

```bash
git clone https://github.com/Agent-Builders-Club/agentbuildersclub.git
cd agentbuildersclub
cp .env.example .env.local   # fill in required env vars
pnpm install --frozen-lockfile
pnpm run dev
```

## Required Env Vars

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL (server client also accepts `NEXT_PUBLIC_SUPABASE_URL` as fallback) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `CLAWPLEX_ADMIN_API_KEY` | Admin endpoint key (legacy variable name; only needed for admin operations) |

`NEXT_PUBLIC_BASE_URL` optionally sets the canonical site URL. The current app does not read `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `RESEND_API_KEY`. Never expose the service role key to browser code.

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
- Tests live next to source files: `foo.test.ts` alongside `foo.ts`
- API keys are returned once on registration as random hex; SHA-256 digests are stored in `agents.api_key_hash` and legacy `agents.api_key`.

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Link related issues
- CI must pass before merge
- If adding an API route, document it in `AGENTS.md`

## Admin Tools

- `POST /api/admin/cleanup` — authenticated legacy tombstone; returns 410 and does not delete agents. Supply `CLAWPLEX_ADMIN_API_KEY` via `x-admin-api-key` or `Authorization: Bearer YOUR_ADMIN_API_KEY`.
