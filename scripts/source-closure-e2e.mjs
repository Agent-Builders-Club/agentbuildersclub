// IND-01/02 contracts declared before repairs: retired pending reads must not
// strand reappearing zero-count threads; actual homepage JSON-LD has no invented schedule.
import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const base = process.env.ABC_MAINTENANCE_BASE_URL || process.env.UI_ORIGIN;
assert(base && /^http:\/\/127\.0\.0\.1:\d+$/.test(base));
const out = resolve(process.env.ABC_CLOSURE_OUTPUT || 'artifacts/source-closure');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { verdict: 'RED', cases: [] };
async function check(name, fn, options = {}) {
  const context = await browser.newContext({ reducedMotion: 'reduce', ...options });
  await context.tracing.start({ screenshots: true, snapshots: true });
  await context.route('**/*', r => new URL(r.request().url()).origin === base && ['GET', 'HEAD'].includes(r.request().method()) ? r.continue() : r.abort());
  const page = await context.newPage();
  try { await fn(page, context); report.cases.push({ name, verdict: 'PASS' }); }
  catch (e) { report.cases.push({ name, verdict: 'FAIL', reason: e.message }); }
  await page.screenshot({ path: resolve(out, name + '.png') });
  await context.tracing.stop({ path: resolve(out, name + '.zip') });
  await context.close();
}
await check('IND-01-retired-read-reappearance-zero-comments', async (page, context) => {
  await page.clock.install();
  let visible = true, reads = 0, feedReads = 0, release;
  const post = { id: 'closure-post', agent_id: 'closure-agent', agent_name: 'Closure fixture', agent_website: '', agent_photo_url: '', owner: '', content: 'Controlled reappearing post', image_url: null, upvote_count: 0, user_upvoted: false, comment_count: 0, created_at: new Date().toISOString(), agent_post_count: 1, agent_last_active: new Date().toISOString(), agent_capability_tag: '' };
  await context.route(base + '/api/community/feed', r => { feedReads++; return r.fulfill({ json: visible ? [post] : [] }); });
  await context.route(base + '/api/community/comments?*', async r => {
    const n = ++reads;
    if (n === 1) await new Promise(yes => { release = yes; });
    await r.fulfill({ json: n === 1 ? [{ id: 'late-removed-comment', post_id: post.id, content: 'Late retired read', created_at: post.created_at, agent: null }] : [] }).catch(() => {});
  });
  try {
    await page.goto(base + '/community');
    await page.getByRole('button', { name: 'Expand comments (0)', exact: true }).click();
    await expect.poll(() => reads).toBe(1);
    await expect(page.getByText('Loading...', { exact: true })).toBeVisible();
    visible = false;
    await page.clock.fastForward(60001);
    await expect(page.locator('[data-post-id="closure-post"]')).toHaveCount(0);
    visible = true;
    await page.clock.fastForward(60001);
    await expect(page.locator('[data-post-id="closure-post"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Collapse comments (0)', exact: true }).click();
    await page.getByRole('button', { name: 'Expand comments (0)', exact: true }).click();
    await expect.poll(() => reads).toBe(2);
    await expect(page.getByText('No comments yet.', { exact: true })).toBeVisible();
    release(); release = null;
    await expect(page.getByText('Late retired read', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Loading...', { exact: true })).toHaveCount(0);
    report.retirement = { reads, feedReads };
  } finally { release?.(); }
});
await check('IND-02-actual-homepage-JSONLD-no-stale-hours-or-stream', async page => {
  await page.goto(base + '/');
  const schemas = await page.locator('script[type="application/ld+json"]').evaluateAll(nodes => nodes.map(n => JSON.parse(n.textContent)));
  const org = schemas.find(s => s['@type'] === 'Organization');
  assert(org, 'Homepage Organization schema absent');
  assert.equal(org.name, 'Agent Builders Club');
  assert.equal(org.url, 'https://www.agentbuildersclub.dev');
  assert(!('openingHoursSpecification' in org), 'Stale fixed organization hours emitted');
  assert(!/live.stream|18:00|21:00/.test(JSON.stringify(schemas)), 'Stale schedule/stream claim emitted');
  assert(!schemas.some(s => s['@type'] === 'Event'), 'Invented homepage event dates');
  report.homepageSchemas = schemas;
});
// Last-mile failure inventory is retained in evidence/last-mile/failure-modes.md.
// Completed cache, not just a pending first read, must retire with the removed post.
for (const closed of [false, true]) {
  await check(`LM-01-completed-cache-reappearance-${closed ? 'closed' : 'open'}`, async (page, context) => {
    await page.clock.install();
    let visible = true, count = 1, reads = 0;
    const post = { id: 'cached-post', agent_id: 'closure-agent', agent_name: 'Closure fixture', agent_website: '', agent_photo_url: '', owner: '', content: 'Completed cache retirement post', image_url: null, upvote_count: 0, user_upvoted: false, created_at: new Date().toISOString(), agent_post_count: 1, agent_last_active: new Date().toISOString(), agent_capability_tag: '' };
    await context.route(base + '/api/community/feed', r => r.fulfill({ json: visible ? [{ ...post, comment_count: count }] : [] }));
    await context.route(base + '/api/community/comments?*', r => {
      reads++;
      return r.fulfill({ json: reads === 1 ? [{ id: 'cached-reply', post_id: post.id, content: 'Completed retired reply', created_at: post.created_at, agent: null }] : [] });
    });
    await page.goto(base + '/community');
    await expect(page.getByText('Completed retired reply', { exact: true })).toBeVisible();
    await expect(page.getByText('Loading...', { exact: true })).toHaveCount(0);
    assert.equal(reads, 1, 'First read must complete before removal');
    if (closed) await page.getByRole('button', { name: 'Collapse comments (1)', exact: true }).click();
    visible = false;
    await page.clock.fastForward(60001);
    await expect(page.locator('[data-post-id="cached-post"]')).toHaveCount(0);
    visible = true; count = 0;
    await page.clock.fastForward(60001);
    await expect(page.locator('[data-post-id="cached-post"]')).toHaveCount(1);
    const toggle = page.getByRole('button', { name: `${closed ? 'Expand' : 'Collapse'} comments (0)`, exact: true });
    await expect(toggle).toHaveAttribute('aria-expanded', String(!closed));
    if (!closed) {
      await expect(page.getByText('Completed retired reply', { exact: true })).toHaveCount(0);
      await toggle.click();
    }
    await page.getByRole('button', { name: 'Expand comments (0)', exact: true }).click();
    await expect.poll(() => reads).toBe(2);
    await expect(page.getByText('No comments yet.', { exact: true })).toBeVisible();
    await expect(page.getByText('Completed retired reply', { exact: true })).toHaveCount(0);
    report[`completedCache${closed ? 'Closed' : 'Open'}`] = { reads, preservedExpansionChoice: true };
  });
}
// Native painted-pixel oracle: removing only the underlying text must not change
// a single header byte. This catches actual gold CTA bleed, not merely CSS classes.
for (const width of [320, 390, 1440]) for (const javaScriptEnabled of [false, true]) {
  const name = `LM-02-opaque-scrolled-header-${javaScriptEnabled ? 'js' : 'nojs'}-${width}`;
  await check(name, async page => {
    await page.goto(base + '/get-involved');
    await page.evaluate(() => document.fonts.ready);
    await page.locator('nav img').evaluate(img => img.decode());
    const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true });
    const link = page.getByRole('link', { name: 'Ask about attending', exact: false });
    await link.evaluate(el => scrollTo(0, scrollY + el.getBoundingClientRect().top - 18));
    await page.waitForTimeout(200);
    const geometry = await link.boundingBox();
    const header = await nav.boundingBox();
    assert(header.y === 0 && geometry.y >= 0 && geometry.y < header.height, 'Real gold participation link must be behind the fixed header');
    await page.screenshot({ path: resolve(out, name + '-native.png') });
    const clip = { x: 0, y: 0, width, height: Math.floor(header.height) };
    const before = await page.screenshot({ path: resolve(out, name + '-header-content.png'), clip });
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.id = 'closure-hide-main';
      style.textContent = 'main, main * { visibility: hidden !important; }';
      document.head.append(style);
    });
    const after = await page.screenshot({ path: resolve(out, name + '-header-hidden.png'), clip });
    await page.locator('#closure-hide-main').evaluate(el => el.remove());
    report[name] = { link: geometry, header, paintedHeaderIdentical: before.equals(after) };
    assert(before.equals(after), 'Underlying gold CTA/page text changes native painted header pixels');
    const background = await nav.evaluate(el => getComputedStyle(el).backgroundColor);
    assert.equal(background, 'rgb(14, 13, 11)', 'Closed header must use existing opaque void token');
  }, { javaScriptEnabled, viewport: { width, height: width === 320 ? 740 : width === 390 ? 844 : 900 } });
}
await browser.close();
report.verdict = report.cases.every(c => c.verdict === 'PASS') ? 'GREEN' : 'RED';
writeFileSync(resolve(out, 'results.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.verdict === 'GREEN' ? 0 : 1;
