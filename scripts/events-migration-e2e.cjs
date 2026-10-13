#!/usr/bin/env node
/* Retained calendar-only contract, updated for approved archive retirement.
 * Failure inventory: stale cadence/stream/attendance promises; wrong calendar;
 * no usable direct fallback when iframe is blocked or empty; restored archive;
 * escaped apostrophes rendered literally; overflow or uncaught page exceptions.
 * Source RED/GREEN is structural evidence, NOT browser E2E acceptance.
 * Source: node scripts/events-migration-e2e.cjs --source --out <artifact-dir>
 * Browser (parent-owned preview): node scripts/events-migration-e2e.cjs --url http://localhost:3000 --out <artifact-dir>
 * Browser only intercepts third-party calendar with empty content or network failure;
 * it does not claim real Luma availability/content/RSVP or introduce fake events.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];
const out = path.resolve(args.includes('--out') ? value('--out') : 'artifacts/events-migration');
fs.mkdirSync(out, { recursive: true });
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/app/events/events-client.tsx'), 'utf8');
const config = fs.readFileSync(path.join(root, 'src/config.ts'), 'utf8');
const expected = {
  lumaUrl: 'https://luma.com/agentbuildersclub',
  lumaEmbedUrl: 'https://luma.com/embed/calendar/cal-AzkmUYVr0KtSTQ9/events',
  eventFallback: 'New meetup dates are posted on Luma. Join Discord for announcements.',
};
const archive = [
  ['DFW Node 06 — Hermes', 'June 28, 2026', '/node-06-hermes-arlington-03.webp'],
  ['DFW Node 05 — Claude Tools', 'June 3, 2026', '/node-05-claude-tools-southlake-01.webp'],
  ['DFW Node 04 — Frisco', 'May 15, 2026', '/node-04-frisco-01.jpeg'],
  ['DFW Node 03 — Fort Worth', 'May 6, 2026', '/node-03-meetup.png'],
  ['DFW Node 02', 'April 15, 2026', '/spark-arlington.png'],
  ['ClawCon DFW', 'March 24, 2026', '/clawcon-1.webp'],
];
const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', error: error.message }); }
}
function report(mode) {
  const result = { mode, sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), results,
    boundaries: ['No build/full regression/deployment proof', 'Calendar interception tests host fallback only, not real Luma content or RSVP'] };
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (results.some((r) => r.status === 'FAIL')) process.exitCode = 1;
}
if (args.includes('--source')) {
  check('config contract unchanged', () => Object.values(expected).forEach((s) => assert.ok(config.includes(s))));
  check('uses centralized Luma embed', () => assert.match(source, /src=\{siteConfig\.lumaEmbedUrl\}/));
  check('uses centralized direct Luma link', () => assert.match(source, /href=\{siteConfig\.lumaUrl\}/));
  check('current calendar fallback remains outside iframe', () => {
    assert.match(source, /Open the calendar on Luma/);
    assert.ok(!/<iframe\b[^>]*>[^]*?Open the calendar on Luma[^]*?<\/iframe>/.test(source));
  });
  check('no unsupported cadence, streaming, attendance or free guarantees', () => assert.doesNotMatch(source, /every week|weekly meetup|always.{0,12}stream|\d+\+ DFW builders|label: "(?:Attendees|Builders)"|every node is free/i));
  check('data descriptions use literal apostrophes', () => assert.doesNotMatch(source, /"[^"\n]*&apos;[^"\n]*"/));
  check('accepted calendar-only page has no historical archive', () => {
    archive.forEach(([title]) => assert.ok(!source.includes(title), title));
    assert.doesNotMatch(source, />\s*Past\s*</);
  });
  report('SOURCE_ONLY');
} else {
  if (!args.includes('--url')) throw new Error('Provide --source or --url for the parent-owned preview; this script never starts a server.');
  const { expect } = require('@playwright/test');
  (async () => {
    let browser;
    const { launchReadOnly } = require('./read-only-browser.cjs');
    try {
      for (const width of [390, 1440]) {
        for (const state of ['empty', 'blocked']) {
          const name = `${width}-${state}`;
          const launched = await launchReadOnly(value('--url'), { viewport: { width, height: 900 }, reducedMotion: 'reduce' });
          browser = launched.browser; const context = launched.context;
          await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', (e) => errors.push(e.message));
          await page.route('https://luma.com/embed/calendar/**', (route) => state === 'blocked'
            ? route.abort('failed') : route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
          try {
            await page.goto(new URL('/events', value('--url')).href, { waitUntil: 'domcontentloaded' });
            const heading = page.getByRole('heading', { name: 'Events', exact: true });
            await expect(heading).toBeVisible();
            await expect(page.locator('iframe[title="Agent Builders Club Events"]')).toHaveAttribute('src', expected.lumaEmbedUrl);
            const fallback = page.getByRole('link', { name: 'Open the calendar on Luma', exact: true });
            await fallback.scrollIntoViewIfNeeded();
            await expect(fallback).toBeVisible();
            await expect(page.getByRole('link', { name: 'Open the calendar on Luma', exact: true })).toHaveAttribute('href', expected.lumaUrl);
            for (const [title] of archive) await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(0);
            await expect(page.getByText('Past Events', { exact: true })).toHaveCount(0);
            const text = await page.locator('body').innerText();
            assert.doesNotMatch(text, /&apos;|every week|weekly meetup|always.{0,12}stream|\d+\+ DFW builders|every node is free/i);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Horizontal overflow');
            assert.deepEqual(errors, [], 'Uncaught page errors');
            assert.deepEqual(context.readOnlyEvidence.writes, [], 'Attempted browser writes');
            results.push({ name, status: 'PASS' });
          } catch (error) { results.push({ name, status: 'FAIL', error: error.message }); }
          finally {
            await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true, animations: 'disabled' });
            await context.tracing.stop({ path: path.join(out, `${name}.zip`) });
            await context.close(); await browser.close();
          }
        }
      }
    } finally { await browser?.close(); report('BROWSER_E2E'); }
  })().catch((error) => { results.push({ name: 'harness', status: 'FAIL', error: error.message }); report('BROWSER_E2E'); });
}
