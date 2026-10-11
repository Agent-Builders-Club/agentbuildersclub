# Next.js Google font loader compatibility

`patches/next@15.5.27.patch` fixes a build-time failure in the pinned Next.js font loader, without changing the selected typefaces, API behavior or package version.

The actual GitHub build job failed twice before the patch in the Google font loader at `loader.js:122`, where a font URL without a terminal filename extension made a regex match null and `[1]` crashed. The separate Cloudflare build and deployed application succeeded. Retrieve job logs by the exact Actions job endpoint when the CLI aggregated failed logs incorrectly shows another job's successful output.

The patch preserves recognized filename extensions (also with query strings), then recognizes downloaded WOFF/WOFF2 bytes by the format signature when the URL has no extension. Unrecognized formats still fail explicitly. It does not invent font files, replace typefaces, use an insecure network fallback or remove the build check.

pnpm applies the version-bound patch from `pnpm-workspace.yaml` and verifies its hash in `pnpm-lock.yaml`; frozen installation and all local release gates passed after application. Recheck/remove this patch when upgrading Next.js to an upstream version with equivalent handling. Remote exact-head build acceptance remains required before merge.
