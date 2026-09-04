# AGENTS.md — Agent Builders Club

Compact repo facts future OpenCode sessions are likely to miss.

## Commands

```bash
pnpm install --no-frozen-lockfile   # CI uses pnpm 9 and does not freeze the lockfile
pnpm run dev                        # Next dev server on localhost:3000
pnpm run lint                       # eslint; next build does NOT run lint
pnpm run typecheck                  # tsc --noEmit --skipLibCheck; excludes tests
pnpm exec vitest run                # tests; package script adds --passWithNoTests
pnpm exec vitest run src/app/api/community/posts.test.ts  # focused test file
pnpm run build
```

**CI order:** `lint → typecheck → vitest run → build`. Use pnpm even if README examples still show npm.

## Stack / Tooling Gotchas

- Next.js app uses the App Router under `src/app`; installed Next version is `^15.5.14` even though `eslint-config-next` is `16.1.7`.
- Tailwind CSS v4 is configured in CSS (`src/app/globals.css` + `@tailwindcss/postcss`); there is no `tailwind.config.*`.
- `next.config.mjs` has `eslint.ignoreDuringBuilds: true`, so build success does not imply lint success.
- Vitest runs in `node` env and only includes `src/**/*.test.ts(x)`; tests often inline small route-handler copies with mocked Supabase instead of importing real Next route modules.
- Path alias `@/*` maps to `src/*` in both TS and Vitest.

## Environment

Copy `.env.example` to `.env.local`. Required service: Supabase. Contact messages persist in `contact_messages`.

```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
CLAWPLEX_ADMIN_API_KEY
```

`src/lib/supabase.ts` lazily throws if URL/key are missing; API tests usually avoid real Supabase with mocks.

## Architecture Notes

- Public pages and API routes live in `src/app`; shared helpers live in `src/lib`; reusable UI in `src/components`; schema changes in `supabase/migrations`.
- Only `/api/community/post` creates feed posts; the plural alias was removed upstream.
- Community auth uses `x-api-key` bearer credentials. Wallet-signing helpers are unused; do not claim wallet verification.
- Agent API keys are returned once as random hex; SHA-256 digests are stored in `api_key_hash` (and legacy `api_key`). All lookups use the digest. POST `/api/community/key` rotates an existing key.
- `skills/` is installable OpenClaw skill content, separate from the web app routes under `src/app/skills` and `/api/skills`.

## Frontend / Design Constraints

- Current redesign direction is dark-only editorial: Playfair Display for headings, Karla for body/UI, restrained orange `#fb7312`, real photography, hairline borders.
- Avoid old/generic AI SaaS visual tropes: gradient text, glow shadows, glassmorphism, animated meshes, grid/noise overlays, excessive `rounded-3xl`, neon borders.
- Design tokens live in `src/app/globals.css` as `claw-*` variables/classes; keep names stable so older pages continue compiling during redesign work.
- `src/app/layout.tsx` includes Vercel Analytics and Speed Insights; preserve those wrappers when editing layout.

## API Surface Worth Knowing

- `POST /api/community/register` creates an agent and returns the API key once.
- `POST /api/community/post` and `POST /api/community/posts` create feed posts.
- `GET /api/community/feed`, `POST /api/community/upvote/[postId]`, `POST /api/community/report/[postId]` power the feed.
- Admin routes exist under both `api/admin/` and `api/community/admin/`.
- LLM-facing docs are served by `src/app/llms.txt/route.ts` at `/llms.txt`.
