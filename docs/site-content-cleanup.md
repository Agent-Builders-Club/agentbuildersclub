# Site content cleanup — approved scope

Tyler authorized implementation, verification, normal merge and live deployment in the clarification form. Current base: f635afbffe975be302c982e68b8f8014a46bf9e7. Worktree: /home/tyler/agentbuildersclub-migration; branch fix/site-content-cleanup-20261010. Original dirty checkout remains untouched.

## Acceptance

- Eliminate /community/projects and the homepage spotlight; no redirect. Remove navigation, sitemap and llms discovery references to the removed page.
- Replace only homepage numbered tile 02 with Socials linking exactly to https://linktr.ee/agentbuildersclub. Do not add Socials to main navigation.
- Remove the entire “Keep building between meetups.” homepage block, including its policy copy and agent/docs links. Retain normal footer legal links.
- Remove KiloClaw; retain FTW DAO. Rename public Sponsors/Sponsor labels to Partners/Partner. Keep the legacy redirect URL compatible.
- Add The Copper Wall in the existing Venue Partners section using the supplied venue photograph. No unverified location, address or website link.
- Events page contains the authoritative Luma calendar, a normal heading and direct calendar fallback link; no maintained past-event list or extra promotional section.
- Community feed and profiles are read-only for browser visitors: actual posts, comments and upvote counts remain visible; comment expansion remains; no API-key inputs, registration instructions or browser mutation forms/actions.
- Tyler separately confirmed existing upvotes only, with no new downvote capability. Preserve every agent backend API, authentication digest and data record. Agent instructions remain in llms.txt.

## Test-first evidence

Before any implementation edits, scripts/site-cleanup-e2e.mjs was written and exercised against real production in desktop/mobile Chromium. All 14 intended acceptance checks failed on unchanged production, recorded in artifacts/site-cleanup/before-cleanup-confirmed/results.json with traces. An initial run printed the results but kept its CDP connection open; runner exit was corrected before implementation and confirmed RED rerun completed normally.

Repeat: ABC_QA_LABEL=site-cleanup-production node scripts/site-cleanup-e2e.mjs. The runner is read-only and must report zero browser API writes. Existing release gates and CI remain required. Parent owns integration, publication and deployed identity verification; one source-only child owns the feed/profile UI files only.

## Rollback / boundaries

Use the prior accepted Git source for application rollback. No database migration, registration change, destructive data cleanup, dependency addition or paid service is part of this task. Removed tracked page sources remain recoverable from Git; removal uses trash. The Copper Wall photo preserves the supplied bytes.

## Checkpoint

Homepage/config/discovery, calendar and partner edits are prepared. Source-only feed/profile work is delegated; integrated gates, publication and production acceptance are pending. Do not claim deployment from source edits.
