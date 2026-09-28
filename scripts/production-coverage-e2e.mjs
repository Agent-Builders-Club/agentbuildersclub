// E2E contract for a private Next production build. No source or coverage API is deployed.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const root = process.cwd();
const out = path.join(root, 'artifacts/coverage/next16-private');
const origin = 'http://127.0.0.1:3297';
const route = 'src/app/api/coverage-canary/route.ts';
const client = 'src/app/coverage-canary/client.tsx';
function assertCanary(coverage, file, taken, untaken) {
  const entries = Object.entries(coverage).filter(([key]) => key.replaceAll('\\', '/').endsWith('/' + file));
  assert.equal(entries.length, 1, `${file}: exactly one original-source coverage key`);
  const [, value] = entries[0];
  const on = Object.entries(value.statementMap).filter(([, loc]) => loc.start.line === taken).map(([id]) => value.s[id]);
  const off = Object.entries(value.statementMap).filter(([, loc]) => loc.start.line === untaken).map(([id]) => value.s[id]);
  assert.ok(on.length && on.some(n => n > 0), `${file}:${taken} must be taken`);
  assert.ok(off.length && off.every(n => n === 0), `${file}:${untaken} must be untaken`);
  return { file, taken, untaken, takenCounts: on, untakenCounts: off };
}
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3297'], {
  cwd: root, env: { ...process.env, NODE_OPTIONS: `--import=${path.join(root, 'scripts/production-coverage-hook.mjs')}`, COVERAGE_PRIVATE_DIR: out }, stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { logs += chunk; });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(`next start exited: ${logs}`);
    try { const response = await fetch(origin + '/api/coverage-canary?mode=taken'); if (response.ok) { assert.deepEqual(await response.json(), { value: 'SERVER_TAKEN' }); ready = true; break; } } catch {}
    await delay(500);
  }
  assert.ok(ready, `route not ready: ${logs}`);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const response = await page.goto(origin + '/coverage-canary');
  assert.equal(response.status(), 200);
  await page.getByRole('button', { name: 'Run client canary' }).click();
  await page.getByText('CLIENT_TAKEN').waitFor();
  const browserCoverage = await page.evaluate(() => globalThis.__coverage__);
  assert.ok(browserCoverage, 'Chromium instrumentation missing');
  const clientProof = assertCanary(browserCoverage, client, 7, 9);
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'browser-raw.json'), JSON.stringify(browserCoverage));
  // The hook is private to this process tree; no HTTP endpoint exposes server counters.
  const processTable = execFileSync('ps', ['-eo', 'pid=,ppid='], { encoding: 'utf8' }).trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
  const descendants = [server.pid];
  for (let i = 0; i < descendants.length; i++) for (const [pid, ppid] of processTable) if (ppid === descendants[i] && !descendants.includes(pid)) descendants.push(pid);
  for (const pid of descendants) { try { process.kill(pid, 'SIGUSR2'); } catch {} }
  let nodeCoverage = {};
  for (let i = 0; i < 20; i++) {
    await delay(250);
    nodeCoverage = Object.assign({}, ...readdirSync(out).filter(name => /^node-\d+\.json$/.test(name)).map(name => JSON.parse(readFileSync(path.join(out, name), 'utf8'))));
    if (Object.keys(nodeCoverage).some(key => key.endsWith('/' + route))) break;
  }
  const serverProof = assertCanary(nodeCoverage, route, 6, 8);
  writeFileSync(path.join(out, 'node-raw.json'), JSON.stringify(nodeCoverage));
  const published = await fetch(origin + '/api/coverage');
  assert.equal(published.status, 404, 'coverage collection endpoint must not exist');
  console.log(JSON.stringify({ result: 'PASS', serverProof, clientProof, processes: descendants.length }));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await delay(300);
}
