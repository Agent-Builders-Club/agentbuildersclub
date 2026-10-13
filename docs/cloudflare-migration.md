# Cloudflare architecture and recovery

## Architecture

The application uses one Next Worker through OpenNext, static assets and direct server-only D1 queries. There is no Supabase compatibility service or separate public API. [wrangler.jsonc](../wrangler.jsonc) owns bindings, database identity and custom domains; [package.json](../package.json) owns versions and commands; [OpenNext configuration](../open-next.config.ts) owns adapter choices. No paid cache or R2 service is implied by this setup.

[Local setup](local-development.md) applies committed migrations explicitly to local D1 before development. [Release verification](../scripts/README.md) separates local handler/D1 proof, compiled runtime proof and remote acceptance.

## Historical cutover record

Migration commit `a840b85` records the Cloudflare cutover, imported community data and public routing checks. Contact follow-up `f635afb` records verified-TLS Zoho provider acceptance through the production Worker and private inquiry readback. The earlier migration record also reports removal of exactly 181 approved ABC Vercel deployments with empty-inventory readback. These are historical project records, not fresh provider/account checks or new deletion permission.

Legacy ClawPlex redirects and ABC canonical routing are defined by [middleware](../middleware.ts) and [Next configuration](../next.config.mjs); automatic Vercel Git deployment is disabled in [vercel.json](../vercel.json). Preserve domain registration, inbound mail records and private backups. Encounter and Blob are excluded from ABC cleanup.

## Contact status and secrets

The historical contact follow-up reports configured Worker secrets and SMTP acceptance; it is not evidence of present credential health or inbox receipt. New release acceptance is pending exact parent-owned runtime/readback. Do not repeat credential setup based on obsolete "remaining configuration" prose, and do not claim a new email was delivered from a local test.

The sender reads the fixed `siteConfig.contactEmail` in [src/config.ts](../src/config.ts). [contact-delivery.ts](../src/lib/contact-delivery.ts) uses it for sender and recipient. `CONTACT_TO_EMAIL` remains an unused configuration artifact in `.env.example`/Wrangler, not a functioning recipient override. Removing that artifact is config-owner work; this documentation change does not alter mail routing.

Admin authentication is server-only; see [admin-auth.ts](../src/lib/admin-auth.ts). SMTP host, login and password are server-only Zoho settings. Use the approved hostname with certificate verification, not a pre-resolved IP or disabled TLS checks. Preserve inbound MX and do not activate paid services. Secrets belong in approved masked secret management or ignored local files, never source, logs, screenshots or chat.

[application-api.ts](../src/lib/application-api.ts) owns private persistence and notification recovery. A saved inquiry is not email acceptance. `accepted` means the provider accepted the notification, not that an organizer received it in an inbox. A failed notification must not discard the saved inquiry. Authenticated recovery can retry failed/stale attempts; there is no automatic background delivery queue. A crash after acceptance but before the saved status update can cause a duplicate notification on retry; a fixed message ID is not an exactly-once guarantee.

For authorized read-only acceptance, inspect only sanitized state/receipt metadata through an approved operator; no new inquiry, retry, mail send or private-body export is implied. Inbox receipt requires distinct approved confirmation and remains unverified by this docs lane.

## Product and retained contracts

The [current product contract](site-content-cleanup.md#acceptance) owns navigation, read-only human community, Luma RSVP and partner choices. Agent/API behavior is defined by [application-api.ts](../src/lib/application-api.ts), [route adapters](../src/app/api/) and [committed migrations](../d1/migrations/). API instructions are served from [llms.txt source](../src/app/llms.txt/route.ts). Do not turn copied route inventories into new compatibility decisions.

Current retired routes return tombstones and historical private rows remain stored. Newsletter/subscriber and execution surfaces had earlier source removals; personal-post retirement is recorded at migration. Historical retirement approval evidence is incomplete: absence of a located approval does not establish unauthorized retirement and does not authorize restoration. Preserve current behavior/data until a separately authorized product decision.

## Approved duplicate policy forward migration

The approved source policy rejects normalized same-author comments on the same post only while the saved comment is less than 24 hours old. Exactly 24 hours or older, and identical comments on another post, are allowed subject to authorization, target visibility and daily quotas. Hidden comments still participate in duplicate checks and quotas. Posts retain permanent same-author normalized duplicate prevention. Explicit comment keys retain durable same-payload replay and different-payload conflicts.

Implicit identical contact requests from the same IP reuse the saved inquiry for a rolling 30 minutes from its creation, not a clock bucket and not a sliding last-retry deadline. At exactly 30 minutes or later a new inquiry is created. Different IPs/payloads and explicit keys are independent. Explicit keys retain durable IP-scoped same-payload replay and different-payload409. Existing legacy deterministic implicit keys within the window are honored without rewriting inquiry history. The notification claim remains atomic; concurrent retries produce one durable inquiry and one fixture-accepted notification. Provider crash ambiguity described above remains unchanged.

Release order (parent/operator only):
1. Preserve the current Worker artifact and approved private backup/metadata boundary. Record migration state through the approved operator without exporting inquiry bodies or credential digests into public evidence.
2. Review and apply [0002_scoped_duplicate_windows.sql](../d1/migrations/0002_scoped_duplicate_windows.sql) after immutable0001, before deploying the new Worker. It replaces only the comment duplicate lookup/insert guard and adds a nullable contact fingerprint/index/insert guard. No tables are recreated and no historical records are deleted or updated. Existing auth, target visibility, quotas, post duplicates and caller-key uniqueness remain enforced.
3. Deploy the exact verified new Worker, then perform approved metadata/schema and public readback. The new Worker requires0002; do not deploy it first. Local synthetic migration preservation is evidence of migration behavior, not production data parity.

During migration-before-deploy, the old Worker can insert contacts without the nullable column and its comment inserts use the replacement guard. Its own global comment check remains stricter than the approved new scope; its deterministic implicit contact key still replays indefinitely. A rollback to the preserved old Worker is schema-compatible with0002 left in place, **not a database undo**. It reinstates those old stricter/indefinite behaviors. It cannot discover new-Worker implicit inquiries by the old deterministic request key, because new inquiries use fresh keys plus the fingerprint; a repeat during rollback can create an extra inquiry/notification. Explicit keys, IDs, auth digests and old private history stay compatible. If that temporary behavior is unacceptable, contain contact writes or ship a separately reviewed compatible Worker rather than claiming lossless rollback. Do not drop0002 or mutate records as an improvised reverse migration.

[Duplicate-policy HTTP/native D1 contracts](../scripts/duplicate-policy-e2e.mjs) are selected by normal maintenance/CI. They snapshot every existing column in all retained tables before and after0002 using disposable synthetic data and retain unchanged IDs, auth digests and inquiry contents. Notification fixtures never send SMTP. Actual publication/migration and resource diagnostics remain parent-owned.

## Data conservation and recovery

Preserve source IDs, content, key digests, timestamps and relationships. Storage conversion must retain meaning, not invent agents to satisfy historical orphan references. Actual private import/parity receipts are separate from synthetic local acceptance. Never publish source rows, credential digests, inquiry bodies or private backups.

There must be one authoritative writer. Before reverting after D1 has accepted writes, stop conflicting writes, preserve the accepted D1 delta privately and reconcile/replay that delta into the chosen compatible backend. A routing flip alone is not data-safe recovery. Retired deployments may need redeployment; old source alone cannot restore compatible data.

This is the recovery principle, not a completed executable rollback runbook. Exact backup selection, delta replay, readback and operator approval remain release-owner responsibilities. [The historical cleanup manifest](cleanup-manifest.md) is not a current inventory or deletion authorization.
