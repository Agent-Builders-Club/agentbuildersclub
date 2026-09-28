// Informational CI-only wrapper: archive tracked HEAD, transform only copied fonts.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, "artifacts/coverage");
const manifest = path.join(output, "next16-canary.json");
const git = (...args) =>
  execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
// Invalidate a previous PASS before even looking up HEAD or making output folders.
rmSync(output, { recursive: true, force: true });
const scope =
  "CI-only scratch Babel/Istanbul Node+Chromium canaries; no production-wide coverage";
let scratch;
let verdict = {
  schemaVersion: 1,
  result: "BLOCKED",
  commit: null,
  scope,
  blocker: "Probe did not finish",
};
const importLine =
  'import { Playfair_Display, Karla } from "next/font/google";';
const fontBlock = `const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["700", "900"],
  style: ["normal", "italic"],
});

const karla = Karla({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});`;
function replaceExactly(source, before, after) {
  assert.equal(
    source.split(before).length,
    2,
    "Font source changed; review transform before retrying",
  );
  return source.replace(before, after);
}
try {
  mkdirSync(output, { recursive: true });
  const commit = (verdict.commit = git("rev-parse", "HEAD"));
  assert.equal(process.versions.node.split(".")[0], "22", "Node 22 required");
  assert.equal(
    execFileSync("pnpm", ["--version"], { encoding: "utf8" })
      .trim()
      .split(".")[0],
    "9",
    "pnpm 9 required",
  );
  assert.equal(
    git("status", "--porcelain", "--untracked-files=no"),
    "",
    "Tracked worktree must match HEAD (commit changes first)",
  );
  const files = git("ls-files", "-z").split("\0").filter(Boolean);
  assert.ok(files.includes("src/app/layout.tsx"));
  // The OS scratch directory is never a deployable checkout; it is removed in finally.
  scratch = mkdtempSync(path.join(os.tmpdir(), "next16-coverage-"));
  const archive = execFileSync("git", ["-C", root, "archive", "HEAD"], {
    maxBuffer: 50_000_000,
  });
  const extracted = spawnSync("tar", ["-x", "-C", scratch], {
    input: archive,
    encoding: "utf8",
  });
  assert.equal(
    extracted.status,
    0,
    `Archive extraction failed: ${extracted.stderr}`,
  );
  const layout = path.join(scratch, "src/app/layout.tsx");
  let transformed = readFileSync(layout, "utf8");
  transformed = replaceExactly(
    transformed,
    importLine,
    "// CI-only font neutralization; original layout is uncredited.",
  );
  transformed = replaceExactly(
    transformed,
    fontBlock,
    'const playfair = { variable: "" };\nconst karla = { variable: "" };',
  );
  writeFileSync(layout, transformed);
  // Verify *every* tracked byte, not just an expected subset, both before and after build.
  function parity() {
    for (const file of files) {
      const original = readFileSync(path.join(root, file));
      const copy = readFileSync(path.join(scratch, file));
      assert.deepEqual(
        copy,
        file === "src/app/layout.tsx" ? Buffer.from(transformed) : original,
        `Tracked source parity: ${file}`,
      );
    }
  }
  parity();
  symlinkSync(
    path.join(root, "node_modules"),
    path.join(scratch, "node_modules"),
    "dir",
  );
  const run = spawnSync(
    process.execPath,
    ["scripts/production-coverage-next16.mjs"],
    {
      cwd: scratch,
      encoding: "utf8",
      timeout: 480_000,
      maxBuffer: 10_000_000,
      env: {
        ...process.env,
        COVERAGE_SOURCE_REPO: root,
        COVERAGE_SCRATCH_ONLY: "1",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  );
  parity();
  const inner = JSON.parse(
    readFileSync(
      path.join(scratch, "artifacts/coverage/next16-canary.json"),
      "utf8",
    ),
  );
  assert.equal(inner.commit, commit);
  assert.equal(inner.eligibleFileCount, inner.eligibleFiles.length);
  assert.ok(inner.eligibleFiles.includes("src/app/layout.tsx"));
  assert.deepEqual(inner.layout, {
    file: "src/app/layout.tsx",
    status: "uncredited",
    coveredStatements: 0,
    coveredLines: 0,
  });
  if (run.status !== 0 || inner.result !== "PASS_CANARIES_ONLY")
    throw new Error(
      inner.blocker || `Canary driver exited ${run.status ?? run.signal}`,
    );
  assert.equal(inner.proof.result, "PASS");
  for (const [kind, file, taken, untaken] of [
    ["serverProof", "src/app/api/coverage-canary/route.ts", 6, 8],
    ["clientProof", "src/app/coverage-canary/client.tsx", 7, 9],
  ]) {
    const proof = inner.proof[kind];
    assert.equal(proof.file, file);
    assert.equal(proof.taken, taken);
    assert.equal(proof.untaken, untaken);
    assert.ok(proof.takenCounts.length && proof.takenCounts.some((n) => n > 0));
    assert.ok(
      proof.untakenCounts.length && proof.untakenCounts.every((n) => n === 0),
    );
  }
  verdict = {
    schemaVersion: 1,
    result: "PASS_CANARIES_ONLY",
    commit,
    scope,
    eligibleFileCount: inner.eligibleFileCount,
    layout: inner.layout,
    sourceParity:
      "All tracked HEAD bytes identical except exact-text neutralized scratch layout",
    build: "next build --webpack with next/babel + babel-plugin-istanbul",
    proof: inner.proof,
    productionStatementTotals: null,
    productionLineTotals: null,
    exclusions: [
      "Original layout uncredited/zero",
      "Build/prerender and Edge uncredited",
      "No 64-file location union or Vitest compatibility proven",
    ],
  };
} catch (error) {
  // Never publish scratch paths, logs, counters, or source maps in the verdict.
  verdict.blocker = String(error.message)
    .replaceAll(scratch || "\0", "[scratch]")
    .replaceAll(root, "[source]");
  process.exitCode = 1;
} finally {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  writeFileSync(manifest, JSON.stringify(verdict, null, 2) + "\n");
  console.log(
    `${verdict.result}: ${verdict.blocker || "Node and Chromium original-location canaries verified"}; artifact: ${path.relative(root, manifest)}`,
  );
}
