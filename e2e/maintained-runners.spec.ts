import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";

// Retained migration user contracts execute against the same built Next server
// selected by Playwright. No personal Chrome profile, provider credentials or
// application fixtures. API-backed cleanup has a separate explicit D1 seam.
const root = path.resolve(__dirname, "..");
const entries = [
  {
    name: "navigation keyboard mobile focus and resize",
    script: "nav-migration-e2e.cjs",
    args: [],
    report: "results.json",
    env: (out: string) => ({
      NAV_E2E_BASE_URL: "http://127.0.0.1:3219",
      NAV_E2E_OUTPUT: out,
    }),
  },
  {
    name: "home human actions photos and honesty",
    script: "home-migration-e2e.cjs",
    args: ["--out"],
    report: "home-results.json",
    env: () => ({ HOME_E2E_URL: "http://127.0.0.1:3219" }),
  },
  {
    name: "events blocked and empty calendar fallback",
    script: "events-migration-e2e.cjs",
    args: ["--url", "http://127.0.0.1:3219", "--out"],
    report: "results.json",
    env: () => ({}),
  },
  {
    name: "footer public hierarchy socials contact",
    script: "footer-migration-e2e.cjs",
    args: ["--url", "http://127.0.0.1:3219", "--output"],
    report: "footer.json",
    env: () => ({}),
  },
  {
    name: "contact native validation and offline draft",
    script: "contact-migration-e2e.cjs",
    args: [],
    report: "results.json",
    env: (out: string) => ({
      CONTACT_BASE_URL: "http://127.0.0.1:3219",
      CONTACT_ARTIFACT_DIR: out,
      CONTACT_TEST_MODE: "ui",
    }),
  },
];
for (const entry of entries)
  test(`maintained: ${entry.name}`, async ({}, testInfo) => {
    test.setTimeout(180_000);
    const out = testInfo.outputPath("standalone");
    mkdirSync(out, { recursive: true });
    const outputArg =
      entry.report === "footer.json" ? path.join(out, "footer.json") : out;
    const args = [...entry.args];
    if (args.length) args.push(outputArg);
    const run = spawnSync(
      process.execPath,
      [path.join(root, "scripts", entry.script), ...args],
      {
        cwd: root,
        env: { ...process.env, ...entry.env(out) },
        encoding: "utf8",
        timeout: 170_000,
      },
    );
    await testInfo.attach("runner-output", {
      body: (run.stdout || "") + (run.stderr || ""),
      contentType: "text/plain",
    });
    expect(run.error, "runner must finish").toBeUndefined();
    expect(run.status, run.stdout + run.stderr).toBe(0);
    const report = JSON.parse(
      readFileSync(path.join(out, entry.report), "utf8"),
    );
    const cases = report.cases || report.results || report.checks;
    expect(
      Array.isArray(cases) && cases.length > 0,
      "empty standalone discovery is not a pass",
    ).toBe(true);
    expect(
      cases.every(
        (row: { status?: string; passed?: boolean }) =>
          row.passed === true || ["PASS", "passed"].includes(row.status || ""),
      ),
    ).toBe(true);
    for (const file of readdirSync(out))
      if (/\.(zip|json|png)$/.test(file))
        await testInfo.attach(file, { path: path.join(out, file) });
  });
