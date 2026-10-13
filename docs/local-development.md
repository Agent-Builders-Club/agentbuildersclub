# Local first-run setup

This procedure affects the checkout's local machine only, not the Cloudflare production database. Use Node 22 and the pnpm version declared by [package.json](../package.json). Read [.env.example](../.env.example) before running commands. A browser does not need database credentials.

1. Install from the committed lockfile in the repository root:

   ```bash
   pnpm install --frozen-lockfile
   cp .env.example .env.local
   ```

2. Apply committed migrations to the local database named by [wrangler.jsonc](../wrangler.jsonc):

   ```bash
   pnpm exec wrangler d1 migrations apply agentbuildersclub --local
   pnpm exec wrangler d1 migrations list agentbuildersclub --local
   ```

   Keep `--local` explicit. Do not replace it with `--remote`. Wrangler tracks applied migrations; repeat application adds outstanding migrations rather than importing production data. Review each migration before use. The [committed schema](../d1/migrations/) is authoritative; never substitute historical PostgreSQL or synthetic Worker schema.

3. Start development:

   ```bash
   pnpm run dev
   ```

   Open `http://localhost:3000`. [next.config.mjs](../next.config.mjs) initializes the Cloudflare development context but does not apply schema. Empty local tables are expected; use synthetic local records only. Do not copy private production exports or credential digests into development.

## Storage and reset boundary

Default Wrangler local state is under `.wrangler/state`; default D1 persistence uses its `v3/d1` subtree. Keep the same checkout and default persistence path for migration application and the development context. A custom `--persist-to` path is not interchangeable unless the consumer is configured to use that same path. The [HTTP/D1 acceptance runner](../e2e/API_DB.md) has separate disposable storage; running it does not initialize ordinary development tables.

Do not reset local state to repair a failed migration without first preserving needed local data. Never delete remote D1, edit applied migration history or use a production backup as a seed. Future migrations should be reviewed additive changes; destructive data/schema operations require separate authorization.

## Secrets and contact

Use synthetic local admin values. Wrangler-local secrets belong in ignored `.dev.vars`; Next-local values belong in ignored `.env.local` when required by the development runtime. Do not put SMTP production credentials into tests or publish secrets in `NEXT_PUBLIC_` values. Missing SMTP credentials should leave a privately saved inquiry with an honest pending/failed notification status, not a claimed delivery.

The fixed email recipient is [siteConfig.contactEmail](../src/config.ts). `CONTACT_TO_EMAIL` still appears in historical configuration examples but is not consumed by the sender; changing it does not route email. Read [contact status and secrets](cloudflare-migration.md#contact-status-and-secrets).

Use a separate credential-free checkout for the [browser fixture suite](../e2e/README.md), whose guard intentionally rejects local environment files. Release checks and their evidence boundary live in [scripts/README.md](../scripts/README.md).
