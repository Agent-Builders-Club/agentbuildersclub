#!/usr/bin/env node
/* Preimplementation contract. Scope: events-client.tsx only.
 * Failure inventory: stale cadence/stream/attendance promises; hardcoded calendar;
 * no direct fallback when iframe is blocked or empty; renamed historical titles;
 * lost dates/photos; escaped apostrophes rendered literally; current CTA says Node.
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
  check('evergreen fallback outside iframe', () => {
    assert.match(source, /\{siteConfig\.eventFallback\}/);
    assert.ok(!/<iframe\b[^>]*>[^]*?siteConfig\.eventFallback[^]*?<\/iframe>/.test(source));
  });
  check('current CTA uses Meetup', () => assert.match(source, /Come to the next Meetup\./));
  check('no unsupported cadence, streaming, attendance or free guarantees', () => assert.doesNotMatch(source, /every week|weekly meetup|always.{0,12}stream|\d+\+ DFW builders|label: "(?:Attendees|Builders)"|every node is free/i));
  check('data descriptions use literal apostrophes', () => assert.doesNotMatch(source, /"[^"\n]*&apos;[^"\n]*"/));
  check('preserves all six historical dates, titles and photographs', () => {
    archive.flat().forEach((s) => assert.ok(source.includes(s), s));
    assert.equal((source.match(/slug: "/g) || []).length, 6);
    assert.match(source, />\s*Past\s*</);
  });
  report('SOURCE_ONLY');
} else {
  if (!args.includes('--url')) throw new Error('Provide --source or --url for the parent-owned preview; this script never starts a server.');
  const { chromium, expect } = require('@playwright/test');
  (async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      for (const width of [390, 1440]) {
        for (const state of ['empty', 'blocked']) {
          const name = `${width}-${state}`;
          const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
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
            const fallback = page.getByText(expected.eventFallback, { exact: true });
            await fallback.scrollIntoViewIfNeeded();
            await expect(fallback).toBeVisible();
            await expect(page.getByRole('link', { name: 'View meetups on Luma', exact: true })).toHaveAttribute('href', expected.lumaUrl);
            for (const [title, date] of archive) {
              const card = page.getByRole('heading', { name: title, exact: true }).locator('..');
              await card.scrollIntoViewIfNeeded();
              await expect(card.getByText('Past', { exact: true })).toBeVisible();
              await expect(card.getByText(date, { exact: true })).toBeVisible();
              const image = card.getByRole('img', { name: title, exact: true });
              await expect(image).toBeVisible();
              await expect.poll(() => image.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
            }
            const cta = page.getByRole('heading', { name: 'Come to the next Meetup.', exact: true });
            await cta.scrollIntoViewIfNeeded();
            await expect(cta).toBeVisible();
            const text = await page.locator('body').innerText();
            assert.doesNotMatch(text, /&apos;|every week|weekly meetup|always.{0,12}stream|\d+\+ DFW builders|every node is free/i);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Horizontal overflow');
            assert.deepEqual(errors, [], 'Uncaught page errors');
            results.push({ name, status: 'PASS' });
          } catch (error) { results.push({ name, status: 'FAIL', error: error.message }); }
          finally {
            await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true, animations: 'disabled' });
            await context.tracing.stop({ path: path.join(out, `${name}.zip`) });
            await context.close();
          }
        }
      }
    } finally { await browser.close(); report('BROWSER_E2E'); }
  })().catch((error) => { results.push({ name: 'harness', status: 'FAIL', error: error.message }); report('BROWSER_E2E'); });
}
