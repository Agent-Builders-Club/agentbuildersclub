# Site content cleanup — current product contract

The Acceptance section is the current product boundary. Test-first/checkpoint statements are historical receipts for the named revisions, not fresh acceptance or new release approval. The current repair release still requires parent-owned approval and exact readback.

Tyler authorized implementation, verification, normal merge and live deployment in the clarification form. Current base: f635afbffe975be302c982e68b8f8014a46bf9e7. Worktree: /home/tyler/agentbuildersclub-migration; branch fix/site-content-cleanup-20261010. Original dirty checkout remains untouched.

## Acceptance

- Eliminate /community/projects and the homepage spotlight; no redirect. Remove navigation, sitemap and llms discovery references to the removed page.
- Replace only homepage numbered tile 02 with Socials linking exactly to https://linktr.ee/agentbuildersclub. Do not add Socials to main navigation.
- Remove the entire “Keep building between meetups.” homepage block, including its policy copy and agent/docs links. Retain normal footer legal links.
- Remove KiloClaw; retain FTW DAO. Rename public Sponsors/Sponsor labels to Partners/Partner. Keep the legacy redirect URL compatible.
- Add The Copper Wall in the existing Venue Partners section using the supplied venue photograph and the exact website URL subsequently supplied by Tyler: https://thecopperwall.com/. Tyler then specified “Fort Worth, TX” as the location and requested the single FTW DAO card be centered rather than left-aligned.
- Events page contains the authoritative Luma calendar, a normal heading and direct calendar fallback link; no maintained past-event list or extra promotional section.
- Community feed and profiles are read-only for browser visitors: actual posts, comments and upvote counts remain visible; comment expansion remains; no API-key inputs, registration instructions or browser mutation forms/actions.
- Tyler separately confirmed existing upvotes only, with no new downvote capability. Preserve every agent backend API, authentication digest and data record. Agent instructions remain in llms.txt.

## Historical test-first evidence

Before any implementation edits, scripts/site-cleanup-e2e.mjs was written and exercised against real production in desktop/mobile Chromium. All 14 intended acceptance checks failed on unchanged production, recorded in artifacts/site-cleanup/before-cleanup-confirmed/results.json with traces. An initial run printed the results but kept its CDP connection open; runner exit was corrected before implementation and confirmed RED rerun completed normally.

Repeat prerequisites: run on the same Linux machine as a dedicated Chromium debugging process and inspect [the actual runner](../scripts/site-cleanup-e2e.mjs) before use. At this frozen revision it unconditionally reads `~/.config/chromium-browser/DevToolsActivePort`, even with `ABC_CDP_URL`. Start Chromium with `--remote-debugging-port=0` using a dedicated synthetic-only profile at that path, only if the path is not an existing personal profile. Never relaunch a personal browser profile, expose its debugging port externally or modify unrelated browser state. If that profile path is occupied, use a separately reviewed runner override repair instead. A custom debugging URL alone cannot remove the current file prerequisite. Test-owner CDP portability and fail-before-forward write blocking are pending parent readback; this docs change does not implement them.

Once the prerequisite and approved read-only interception are verified, repeat from the repository root: `ABC_QA_LABEL=site-cleanup-production node scripts/site-cleanup-e2e.mjs`. Artifacts go to `artifacts/site-cleanup/<label>/` with JSON, screenshots and traces; select a new label for each run. Do not run the historical live runner until same-origin non-GET API requests are blocked before forwarding, because its old monitor only observes writes. The runner is read-only and must report zero browser API writes. Existing release gates and CI remain required. Parent owns integration, publication and deployed identity verification; one source-only child owns the feed/profile UI files only.

## Rollback / boundaries

Use the prior accepted Git source for application rollback. No database migration, registration change, destructive data cleanup, dependency addition or paid service is part of this task. Removed tracked page sources remain recoverable from Git; removal uses trash. The Copper Wall photo preserves the supplied bytes.

## Historical checkpoint

Homepage/config/discovery, calendar, partner and read-only feed/profile changes merged in PR #75 and deployed from main c21e6bcf6efb20f1fd77350f8aaaab2be103c8f7. Existing release gates and exact-head CI passed. All 14 real production desktop/mobile acceptance checks passed with traces/screenshots in artifacts/site-cleanup/site-cleanup-accepted. The first post-deploy run falsely counted the embedded Luma calendar's Sentry telemetry as a site API write; captured network evidence identified the external origin, and the same-origin monitor correction passed against unchanged product source. The corrected runner is a harness-only follow-up, not a product repair.
