// Frozen before harness repair. These subprocess contracts protect execution safety,
// not application internals. Failure modes: SMTP secrets or .dev.vars reach a build;
// stale success survives refusal; contact full mode forwards a nonlocal inquiry;
// empty or partial browser/backend reports certify full maintenance acceptance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
function isolated() {
  const dir = mkdtempSync(resolve(tmpdir(), 'abc-runner-contract-'));
  mkdirSync(resolve(dir, 'scripts'));
  cpSync(resolve(root, 'scripts/run-e2e.mjs'), resolve(dir, 'scripts/run-e2e.mjs'));
  mkdirSync(resolve(dir, 'artifacts/e2e'), { recursive: true });
  writeFileSync(resolve(dir, 'artifacts/e2e/manifest.json'), '{"result":"passed"}');
  return dir;
}
for (const name of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD']) test(`browser CLI refuses ${name} before build with a fresh failure receipt`, () => {
  const dir = isolated();
  const run = spawnSync(process.execPath, [resolve(dir, 'scripts/run-e2e.mjs')], { env: { ...process.env, [name]: 'canary-not-a-secret' }, encoding: 'utf8', timeout: 5000 });
  assert.equal(run.status, 2, run.stdout + run.stderr);
  const report = JSON.parse(readFileSync(resolve(dir, 'artifacts/e2e/manifest.json')));
  assert.equal(report.result, 'blocked');
  assert.equal(report.caseCount, 0);
});
test('browser CLI refuses .dev.vars before build', () => {
  const dir = isolated(); writeFileSync(resolve(dir, '.dev.vars'), 'SMTP_PASSWORD=canary');
  const run = spawnSync(process.execPath, [resolve(dir, 'scripts/run-e2e.mjs')], { encoding: 'utf8', timeout: 5000 });
  assert.equal(run.status, 2, run.stdout + run.stderr);
  assert.equal(JSON.parse(readFileSync(resolve(dir, 'artifacts/e2e/manifest.json'))).result, 'blocked');
});
for (const argument of ['--pass-with-no-tests', '--list']) test(`browser acceptance CLI rejects ${argument} instead of certifying no execution`, () => {
  const dir = isolated();
  const run = spawnSync(process.execPath, [resolve(dir, 'scripts/run-e2e.mjs'), argument], { encoding: 'utf8', timeout: 5000 });
  assert.equal(run.status, 2, run.stdout + run.stderr);
  assert.match(run.stdout + run.stderr, /does not execute|empty discovery/i);
});
test('contact full CLI refuses a production origin before launch or transmission', () => {
  // Independent barrier: even a future missing guard must never launch a browser
  // or transmit this negative control to the real destination.
  const dir = mkdtempSync(resolve(tmpdir(), 'abc-contact-guard-'));
  const barrier = resolve(dir, 'no-browser.cjs');
  writeFileSync(barrier, `const Module = require('node:module'); const load = Module._load; Module._load = function(name, ...args) { if (name === '@playwright/test') return { chromium: { launch() { throw Error('Independent canary barrier blocked browser launch'); } } }; return load.call(this, name, ...args); };`);
  const run = spawnSync(process.execPath, ['--require', barrier, 'scripts/contact-migration-e2e.cjs'], { cwd: root, env: { ...process.env, CONTACT_BASE_URL: 'https://www.agentbuildersclub.dev', CONTACT_TEST_MODE: 'full', CONTACT_ARTIFACT_DIR: dir }, encoding: 'utf8', timeout: 5000 });
  assert.notEqual(run.status, 0);
  assert.match(run.stdout + run.stderr, /disposable loopback/i);
});
