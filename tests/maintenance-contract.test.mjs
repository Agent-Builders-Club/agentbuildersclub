// Contract before maintenance orchestrator: absence of disposable D1/browser
// seam must fail before invoking builds, with a durable BLOCKED receipt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
test('maintenance refuses an absent disposable runtime rather than skipping cleanup green', () => {
  const out = mkdtempSync(resolve(tmpdir(), 'abc-maintenance-contract-'));
  const env = { ...process.env, ABC_MAINTENANCE_OUTPUT: out }; delete env.ABC_MAINTENANCE_BASE_URL;
  const run = spawnSync(process.execPath, ['scripts/maintenance-e2e.mjs'], { cwd: resolve(import.meta.dirname, '..'), env, encoding: 'utf8', timeout: 5000 });
  assert.equal(run.status, 2, run.stdout + run.stderr);
  const receipt = JSON.parse(readFileSync(resolve(out, 'results.json')));
  assert.equal(receipt.verdict, 'BLOCKED');
  assert.equal(receipt.steps.length, 0);
});
