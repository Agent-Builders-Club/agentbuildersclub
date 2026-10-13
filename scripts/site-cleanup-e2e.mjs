import { expect } from '@playwright/test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { launchReadOnly, localOrigin } = require('./read-only-browser.cjs');
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const base = process.env.ABC_QA_URL;
if (!base) throw Error('ABC_QA_URL must name the disposable loopback runtime');
localOrigin(base);
const label = process.env.ABC_QA_LABEL || 'site-cleanup';
assert(/^[a-z0-9-]+$/i.test(label));
const dir = path.resolve(process.env.ABC_QA_OUTPUT || 'artifacts/site-cleanup', label);
fs.mkdirSync(dir, { recursive: true });
const startedAt = new Date().toISOString();
const results = [];
let failed = false;
const allEvidence = [];
try {
for (const mode of [{ name: 'desktop', viewport: { width: 1440, height: 900 } }, { name: 'mobile', viewport: { width: 390, height: 844 } }, { name: 'small-mobile', viewport: { width: 320, height: 740 } }]) {
  const { browser, context } = await launchReadOnly(base, { viewport: mode.viewport, reducedMotion: 'reduce', timezoneId: 'America/Chicago' });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  const { writes, errors } = context.readOnlyEvidence;
  const identities = [];
  allEvidence.push({ mode: mode.name, identities, writes, errors });
  async function verifyPost(post, profile = false) {
    // Parent-owned UI seam: both production post cards expose their existing
    // durable response ID as data-post-id; no index/text-derived identity.
    const card = page.locator(`[data-post-id=${JSON.stringify(post.id)}]`);
    await expect(card).toHaveCount(1);
    await expect(card.getByText(post.content, { exact: true })).toBeVisible();
    const votes = profile ? post.upvotes : post.upvote_count;
    const vote = card.locator('[data-vote-count]');
    await expect(vote).toHaveCount(1);
    await expect(vote).toHaveAttribute('data-vote-count', String(votes));
    await expect(vote).toHaveAttribute('aria-label', `${votes} upvotes`);
    await expect(vote).toHaveText(`${votes} upvotes`);
    const toggle = card.getByRole('button', { name: /(?:Collapse|Expand) comments/ });
    await expect(toggle).toHaveText(String(post.comment_count));
    await expect(toggle).toHaveAccessibleName(/^(Collapse|Expand) comments/);
    identities.push({ mode: mode.name, surface: profile ? 'profile' : 'feed', postId: post.id, votes, comments: post.comment_count });
    return { card, toggle };
  }
  async function verifyComments(post, profile = false) {
    const { card, toggle } = await verifyPost(post, profile);
    const response = await context.request.get(base + '/api/community/comments?post_id=' + encodeURIComponent(post.id));
    assert.equal(response.status(), 200);
    const comments = await response.json();
    assert(comments.length > 0, 'Real comments required');
    for (const comment of comments) await expect(card.locator(`[data-comment-id=${JSON.stringify(comment.id)}]`).getByText(comment.content, { exact: true })).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    for (const comment of comments) await expect(card.locator(`[data-comment-id=${JSON.stringify(comment.id)}]`)).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    for (const comment of comments) await expect(card.locator(`[data-comment-id=${JSON.stringify(comment.id)}]`).getByText(comment.content, { exact: true })).toBeVisible();
  }
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
    fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify({ base, startedAt, passed: !failed, results, identities, writes, errors }, null, 2));
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
      await expect(page.getByRole('navigation', { name: 'Main navigation', exact: true })).toHaveCount(1);
      assert.equal(await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Projects', exact: true }).count(), 0);
      await capture('home');
    });
    await check('projects-route-eliminated', async () => {
      const r = await context.request.get(base + '/community/projects', { maxRedirects: 0 }); assert.equal(r.status(), 404);
    });
    await check('events-calendar-only', async () => {
      await page.goto(base + '/events', { waitUntil: 'networkidle' });
      assert.equal(await page.getByText('Past Events', { exact: true }).count(), 0);
      await expect(page.locator('iframe')).toHaveAttribute('src', 'https://luma.com/embed/calendar/cal-AzkmUYVr0KtSTQ9/events');
      await expect(page.getByRole('link', { name: 'Open the calendar on Luma', exact: true })).toHaveAttribute('href', 'https://luma.com/agentbuildersclub');
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
      await expect(page.locator('[data-vote-count]')).toHaveCount(posts.length);
      for (const entry of posts) await verifyPost(entry);
      await verifyComments(post);
      await capture('community');
    });
    await check('agent-profile-read-only', async () => {
      const id = posts.find(p => p.comment_count > 0)?.agent_id; assert(id);
      const r = await page.goto(base + '/community/agents/' + encodeURIComponent(id), { waitUntil: 'networkidle' }); assert.equal(r.status(), 200);
      assert.equal(await page.locator('input,textarea,form').count(), 0);
      assert.equal(await page.getByText('Agent API key', { exact: true }).count(), 0);
      await expect(page.getByRole('button', { name: /upvote|downvote|report|follow|post comment/i })).toHaveCount(0);
      const response = await context.request.get(base + '/api/community/agents/' + encodeURIComponent(id));
      assert.equal(response.status(), 200); const profile = await response.json();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(profile.agent.name);
      assert(profile.posts.length > 0, 'Real profile posts required');
      await expect(page.locator('[data-vote-count]')).toHaveCount(profile.posts.length);
      for (const post of profile.posts) await verifyPost(post, true);
      const commented = profile.posts.find(post => post.comment_count > 0); assert(commented, 'Real commented profile post required');
      await verifyComments(commented, true);
      await capture('profile');
    });
    await check('agent-discovery-preserved-and-no-browser-api-writes', async () => {
      const r = await context.request.get(base + '/llms.txt'); assert.equal(r.status(), 200);
      const text = await r.text(); assert.match(text, /register/i); assert.match(text, /upvote/i);
      assert(!text.includes('/community/projects'));
      assert.deepEqual(writes, []); assert.deepEqual(errors, []);
      const sitemap = await context.request.get(base + '/sitemap.xml'); assert.equal(sitemap.status(), 200);
      assert(!(await sitemap.text()).includes('/community/projects'));
    });
  } finally {
    await context.tracing.stop({ path: path.join(dir, `${mode.name}-trace.zip`) }); await context.close(); await browser.close();
    if (writes.length || errors.length) failed = true;
  }
}
} catch (error) { failed = true; results.push({ name: 'harness-prerequisite', passed: false, error: error.message }); }
const passed = !failed && results.length === 21 && results.every(row => row.passed);
fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify({ base, startedAt, passed, checks: results.length, results, evidence: allEvidence }, null, 2));
console.log(JSON.stringify({ base, passed, checks: results.length, evidence: dir }));
process.exit(passed ? 0 : 1);
