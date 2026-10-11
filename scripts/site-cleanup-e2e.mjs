import { chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const base = process.env.ABC_QA_URL || 'https://www.agentbuildersclub.dev';
const label = process.env.ABC_QA_LABEL || 'site-cleanup';
assert(/^[a-z0-9-]+$/i.test(label));
const dir = path.resolve('artifacts/site-cleanup', label);
fs.mkdirSync(dir, { recursive: true });
const port = fs.readFileSync(path.join(os.homedir(), '.config/chromium-browser/DevToolsActivePort'), 'utf8').split('\n')[0];
const browser = await chromium.connectOverCDP(process.env.ABC_CDP_URL || `http://127.0.0.1:${port}`);
const results = [];
let failed = false;
for (const mode of [{ name: 'desktop', viewport: { width: 1440, height: 900 } }, { name: 'mobile', viewport: { width: 390, height: 844 } }]) {
  const context = await browser.newContext(mode);
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  const writes = [];
  page.on('request', r => { const url = new URL(r.url()); if (url.origin === new URL(base).origin && url.pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(r.method())) writes.push(r.method() + ' ' + url.pathname); });
  async function capture(name) {
    const height = Math.min(await page.evaluate(() => document.documentElement.scrollHeight), 30000);
    for (let y = 0; y < height; y += mode.viewport.height * 0.75) {
      await page.evaluate(top => window.scrollTo(0, top), y);
      await page.waitForTimeout(100);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(dir, `${mode.name}-${name}.png`), fullPage: true, animations: 'disabled' });
  }
  async function check(name, action) {
    try { await action(); results.push({ mode: mode.name, name, passed: true }); }
    catch (error) { failed = true; results.push({ mode: mode.name, name, passed: false, error: error.message }); }
    fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify({ base, passed: !failed, results }, null, 2));
  }
  try {
    await check('homepage-removals-and-socials', async () => {
      const r = await page.goto(base, { waitUntil: 'networkidle' }); assert.equal(r.status(), 200);
      assert.equal(await page.getByText('Keep building between meetups.', { exact: true }).count(), 0);
      assert.equal(await page.getByText('Community spotlight', { exact: true }).count(), 0);
      assert.equal(await page.locator('a[href="/community/projects"]').count(), 0);
      const socials = page.getByRole('link', { name: 'Socials', exact: true }); assert.equal(await socials.count(), 1);
      assert.equal(await socials.getAttribute('href'), 'https://linktr.ee/agentbuildersclub');
      assert.match(await socials.innerText(), /02/);
      assert.equal(await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Projects', exact: true }).count(), 0);
      await capture('home');
    });
    await check('projects-route-eliminated', async () => {
      const r = await context.request.get(base + '/community/projects', { maxRedirects: 0 }); assert.equal(r.status(), 404);
    });
    await check('events-calendar-only', async () => {
      await page.goto(base + '/events', { waitUntil: 'networkidle' });
      assert.equal(await page.getByText('Past Events', { exact: true }).count(), 0);
      assert.equal(await page.locator('iframe[src*="cal-AzkmUYVr0KtSTQ9"]').count(), 1);
      assert.equal(await page.getByText('DFW Node 06 — Hermes', { exact: true }).count(), 0);
      await capture('events');
    });
    await check('partners-and-copper-wall-venue', async () => {
      await page.goto(base + '/get-involved', { waitUntil: 'networkidle' });
      assert.equal(await page.getByText('KiloClaw', { exact: true }).count(), 0);
      assert.equal(await page.getByText('Sponsors', { exact: true }).count(), 0);
      assert.equal(await page.getByText('Partners', { exact: true }).count(), 1);
      assert.equal(await page.getByText('FTW DAO', { exact: true }).count(), 1);
      const section = page.locator('section').filter({ has: page.getByText('Venue Partners', { exact: true }) });
      assert.equal(await section.getByText('The Copper Wall', { exact: true }).count(), 1);
      const copper = section.getByRole('link', { name: 'Visit The Copper Wall', exact: true });
      assert.equal(await copper.getAttribute('href'), 'https://thecopperwall.com/');
      assert.equal(await copper.getByText('Fort Worth, TX', { exact: true }).count(), 1);
      const ftw = page.getByRole('link', { name: 'Visit FTW DAO', exact: true });
      const center = await ftw.evaluate(el => { const r = el.getBoundingClientRect(); const p = el.closest('section').getBoundingClientRect(); return Math.abs((r.left + r.width / 2) - (p.left + p.width / 2)); });
      assert(center <= 2, 'Single FTW DAO partner card must be centered');
      const img = section.locator('img[src*="copper-wall"]'); assert.equal(await img.count(), 1);
      await img.scrollIntoViewIfNeeded(); await img.waitFor({ state: 'visible' });
      await page.waitForFunction(() => { const i = document.querySelector('img[src*="copper-wall"]'); return i?.complete && i.naturalWidth > 0; });
      await capture('partners');
    });
    let posts = [];
    await check('community-read-only-with-real-posts-votes-and-comments', async () => {
      await page.goto(base + '/community', { waitUntil: 'networkidle' });
      posts = await page.evaluate(async () => (await fetch('/api/community/feed')).json());
      assert(Array.isArray(posts) && posts.length > 0);
      assert.equal(await page.getByText('Agent API key', { exact: true }).count(), 0);
      assert.equal(await page.getByText('Registration instructions', { exact: true }).count(), 0);
      assert.equal(await page.locator('input,textarea,form').count(), 0);
      assert.equal(await page.getByRole('button', { name: /upvote|downvote|report/i }).count(), 0);
      const post = posts.find(p => p.comment_count > 0); assert(post, 'Real commented post required');
      const comments = await page.evaluate(async id => (await fetch('/api/community/comments?post_id=' + encodeURIComponent(id))).json(), post.id);
      assert(comments.length > 0);
      await page.getByText(comments[0].content, { exact: true }).first().waitFor({ state: 'visible' });
      assert.equal(await page.locator('[data-vote-count]').count(), posts.length);
      await capture('community');
    });
    await check('agent-profile-read-only', async () => {
      const id = posts.find(p => p.comment_count > 0)?.agent_id; assert(id);
      const r = await page.goto(base + '/community/agents/' + encodeURIComponent(id), { waitUntil: 'networkidle' }); assert.equal(r.status(), 200);
      assert.equal(await page.locator('input,textarea,form').count(), 0);
      assert.equal(await page.getByText('Agent API key', { exact: true }).count(), 0);
      assert(await page.locator('[data-vote-count]').count() > 0);
      await capture('profile');
    });
    await check('agent-discovery-preserved-and-no-browser-api-writes', async () => {
      const r = await context.request.get(base + '/llms.txt'); assert.equal(r.status(), 200);
      const text = await r.text(); assert.match(text, /register/i); assert.match(text, /upvote/i);
      assert(!text.includes('/community/projects'));
      assert.deepEqual(writes, []);
    });
  } finally {
    await context.tracing.stop({ path: path.join(dir, `${mode.name}-trace.zip`) }); await context.close();
  }
}
console.log(JSON.stringify({ base, passed: !failed, checks: results.length, evidence: dir }));
process.exit(failed ? 1 : 0);
