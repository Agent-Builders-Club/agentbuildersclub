// Preimplementation safety contract for the shared browser boundary. This is a
// real HTTP server/browser test, not a route mock implementing write prevention.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
test('read-only boundary aborts same-origin POST before server receives it, preserves GET and records exceptions', async () => {
  const { launchReadOnly } = require('../scripts/read-only-browser.cjs');
  const received = [];
  const server = createServer((req, res) => { received.push(`${req.method} ${req.url}`); res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Disposable boundary</title>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const output = resolve(import.meta.dirname, '../artifacts/runner-safety/browser-boundary');
  mkdirSync(output, { recursive: true });
  let browser, context;
  try {
    ({ browser, context } = await launchReadOnly(base, { viewport: { width: 390, height: 844 } }));
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    await page.goto(base);
    const outcomes = await page.evaluate(async () => {
      const get = await fetch('/api/read');
      const post = await fetch('/api/write', { method: 'POST', body: 'disposable' }).then(() => 'forwarded', () => 'blocked');
      const nonApi = await fetch('/contact', { method: 'POST', body: 'disposable' }).then(() => 'forwarded', () => 'blocked');
      return { get: get.status, post, nonApi };
    });
    assert.deepEqual(outcomes, { get: 200, post: 'blocked', nonApi: 'blocked' });
    assert.equal(received.filter(value => value.startsWith('POST')).length, 0);
    assert.deepEqual(context.readOnlyEvidence.writes.map(row => row.pathname), ['/api/write', '/contact']);
    const pageError = page.waitForEvent('pageerror');
    await page.evaluate(() => { setTimeout(() => { throw Error('boundary error canary'); }, 0); });
    await pageError;
    assert.deepEqual(context.readOnlyEvidence.errors, ['boundary error canary']);
    writeFileSync(resolve(output, 'receipt.json'), JSON.stringify({ outcomes, received, evidence: context.readOnlyEvidence }, null, 2));
  } finally {
    if (context) await context.tracing.stop({ path: resolve(output, 'trace.zip') }).catch(() => {});
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
