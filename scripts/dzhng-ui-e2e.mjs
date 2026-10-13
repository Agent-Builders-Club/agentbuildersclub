import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Frozen before production edits: rendered contracts, not component mocks.
// Only loopback is permitted. All API writes and third-party requests are blocked.
const origin = process.env.UI_ORIGIN || 'http://127.0.0.1:3147';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error('Loopback only');
const out = path.resolve(process.env.UI_EVIDENCE || '../evidence/ui/red');
await mkdir(out, { recursive: true });
if ((await readdir(out)).length) throw new Error('Evidence directory must be empty; preserve previous receipts');
const browser = await chromium.launch({ headless: true });
const results = [];
const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const diff = execFileSync('git', ['diff'], { encoding: 'utf8' });
await writeFile(path.join(out, 'source.patch'), diff);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean).sort();
const sourceHashes = {};
for (const file of sourceFiles) {
  try { sourceHashes[file] = sha256(await readFile(file)); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    sourceHashes[file] = 'DELETED';
  }
}
const sourceHash = sha256(JSON.stringify(sourceHashes));
await writeFile(path.join(out, 'source-hashes.json'), JSON.stringify({ source, sourceHash, sourceHashes }, null, 2));
const captures = [];
let activeCase;
async function capture(page, id, state, { fullPage = false } = {}) {
  const geometry = await page.evaluate(() => ({
    url: location.href, viewport: { width: innerWidth, height: innerHeight },
    scroll: { x: scrollX, y: scrollY },
    document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
    devicePixelRatio,
  }));
  const bytes = await page.screenshot({ path: path.join(out, `${id}.png`), fullPage });
  const dimensions = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (!fullPage) expect(dimensions).toEqual(page.viewportSize());
  captures.push({ id, caseName: activeCase.name, javaScriptEnabled: activeCase.javaScriptEnabled, reducedMotion: activeCase.reducedMotion, state, file: `${id}.png`, fullPage, ...geometry, configuredViewport: page.viewportSize(), dimensions, sha256: sha256(bytes), sourceHash });
}
async function run(name, options, test) {
  activeCase = { name, javaScriptEnabled: options.javaScriptEnabled !== false, reducedMotion: process.env.UI_MOTION || 'reduce' };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: process.env.UI_MOTION || 'reduce', ...options });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  const blocked = [];
  await context.route('**/*', async route => {
    const request = route.request();
    if (!request.url().startsWith(origin) || (new URL(request.url()).pathname.startsWith('/api/') && request.method() !== 'GET')) {
      blocked.push({ url: request.url(), method: request.method() });
      return route.abort();
    }
    return route.continue();
  });
  let error;
  try { await test(page, context); } catch (e) { error = String(e.stack || e); }
  // A case may finish on a different scroll/viewport from its named visual state.
  // Preserve explicitly owned summaries rather than replacing them with the final page.
  if (!captures.some(c => c.id === name)) {
    await capture(page, name, error ? 'failure-final-state' : 'final-state').catch(e => { error ||= String(e.stack || e); });
  }
  await context.tracing.stop({ path: path.join(out, `${name}.zip`) });
  results.push({ name, status: error ? 'FAIL' : 'PASS', error, blocked, options, finalUrl: page.url(), finalViewport: page.viewportSize(), captures: captures.filter(c => c.id === name || c.caseName === name).map(c => c.file) });
  console.log(`${error ? 'FAIL' : 'PASS'} ${name}${error ? ': ' + error.split('\n')[0] : ''}`);
  await context.close();
}
async function painted(locator) {
  await expect(locator).toBeVisible();
  expect(await locator.evaluate(el => {
    for (let p = el; p; p = p.parentElement) if (Number(getComputedStyle(p).opacity) < 0.99 || getComputedStyle(p).visibility === 'hidden') return false;
    return el.getBoundingClientRect().width > 0;
  })).toBe(true);
}
for (const [mode, options] of [
  ['nojs', { javaScriptEnabled: false }],
  ['clientfail', {}],
]) {
  await run(`contact-${mode}`, options, async (page, context) => {
    if (mode === 'clientfail') await context.route('**/_next/**/*.js*', r => r.abort());
    await page.goto(origin + '/contact');
    await expect(page.getByLabel('Name', { exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
    await painted(page.getByText(/form requires JavaScript/i));
    await expect(page.locator('a[href="mailto:hello@agentbuildersclub.dev"]').first()).toBeVisible();
    expect(await page.locator('form').getAttribute('method')).toBe('post');
    expect(await page.locator('form').getAttribute('action')).toBe('/contact');
    expect(page.url()).not.toContain('?');
    await expect(page.getByText('Your inquiry was saved.', { exact: false })).toHaveCount(0);
  });
}
await run('contact-controlled-failure', {}, async (page, context) => {
  await context.route(origin + '/api/contact', r => r.fulfill({ status: 503, json: { error: 'Controlled unavailable' } }));
  await page.goto(origin + '/contact');
  await page.getByLabel('Name', { exact: true }).fill('Synthetic UI contract');
  await page.getByLabel('Email', { exact: true }).fill('ui@example.invalid');
  await page.getByLabel('Message', { exact: true }).fill('Synthetic fixture, never transmitted');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('main [role="alert"]')).toContainText('Controlled unavailable');
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('Synthetic fixture, never transmitted');
  expect(page.url()).not.toContain('?');
});
for (const [width, height] of [[1440, 900], [390, 844], [320, 740]]) {
  await run(`participation-nojs-${width}`, { javaScriptEnabled: false, viewport: { width, height } }, async page => {
    await page.goto(origin + '/get-involved');
    await painted(page.getByRole('heading', { level: 1 }));
    await page.evaluate(() => scrollTo(0, 0));
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport({ ratio: 1 });
    await capture(page, `participation-nojs-${width}`, 'nojs-participation-title');
    const choices = [
      ['Come to a meetup', 'Ask about attending'],
      ["Show what you're building", 'Propose a project demo'],
      ['Offer a space in DFW', 'Offer a venue'],
      ['Support useful community work', 'Discuss community support'],
    ];
    for (const [index, [heading, action]] of choices.entries()) {
      const title = page.getByRole('heading', { name: heading, exact: true });
      // Include the row number as well as the heading, prose and action.
      const block = title.locator('../..');
      await block.evaluate(el => scrollTo(0, el.getBoundingClientRect().top + scrollY - 96));
      await expect(block).toBeInViewport({ ratio: 1 });
      await painted(title);
      await expect(title).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole('link', { name: action, exact: false })).toBeInViewport({ ratio: 1 });
      await capture(page, `participation-choice-nojs-${width}-${index + 1}`, `nojs-choice-${index + 1}`);
    }
    await painted(page.getByRole('heading', { name: 'Come to a meetup' }));
    await painted(page.getByRole('link', { name: 'Visit FTW DAO' }));
    await expect(page.getByRole('link', { name: 'Visit The Copper Wall' })).toContainText('Fort Worth, TX');
    await page.getByRole('link', { name: 'Visit FTW DAO' }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('link', { name: 'Visit FTW DAO' }).locator('img')).toHaveJSProperty('complete', true);
    await expect.poll(() => page.getByRole('link', { name: 'Visit FTW DAO' }).locator('img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
    await page.getByRole('link', { name: 'Visit FTW DAO' }).locator('img').evaluate(img => img.decode());
    // Native async decoding can complete before the compositor paints it.
    await page.waitForTimeout(150);
    await capture(page, `partners-nojs-${width}`, 'nojs-ftw-partner');
    for (const image of await page.locator('main img').all()) {
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
      await image.evaluate(img => img.decode());
    }
    await page.waitForTimeout(150);
    await capture(page, `participation-fullpage-nojs-${width}`, 'nojs-all-participation-and-partners', { fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
  await run(`partners-${width}`, { viewport: { width, height } }, async page => {
    await page.goto(origin + '/get-involved');
    for (const name of ['FTW DAO', 'The DEC Network', '25N Coworking']) {
      const card = page.getByRole('link', { name: `Visit ${name}` });
      await card.scrollIntoViewIfNeeded();
      await expect(card.locator('img')).toHaveJSProperty('complete', true);
      const metrics = await card.evaluate(el => {
        const image = el.querySelector('img');
        const caption = el.querySelector('span').parentElement;
        const i = image.getBoundingClientRect(), c = caption.getBoundingClientRect();
        const metadata = caption.querySelector('span:last-child');
        const style = getComputedStyle(metadata);
        return { fit: getComputedStyle(image).objectFit, imageBottom: i.bottom, captionTop: c.top, fontSize: parseFloat(style.fontSize), color: style.color, bg: getComputedStyle(caption).backgroundColor };
      });
      expect(metrics.fit).toBe('contain');
      expect(metrics.captionTop).toBeGreaterThanOrEqual(metrics.imageBottom - 1);
      expect(metrics.fontSize).toBeGreaterThanOrEqual(14);
      const rgb = text => text.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
      const lum = text => rgb(text).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
      const ratio = (lum(metrics.color) + 0.05) / (lum(metrics.bg) + 0.05);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      results.push({ name: `metadata-measurement-${width}-${name}`, status: 'MEASUREMENT', metrics, contrast: ratio });
      await card.locator('img').evaluate(img => img.decode());
      await page.waitForTimeout(150);
      await capture(page, `partner-${width}-${name.replaceAll(' ', '-')}`, 'partner-wordmark-and-caption');
    }
    const ftw = await page.getByRole('link', { name: 'Visit FTW DAO' }).boundingBox();
    expect(Math.abs(ftw.x + ftw.width / 2 - width / 2)).toBeLessThan(2);
    const copper = page.getByRole('link', { name: 'Visit The Copper Wall' });
    expect(await copper.locator('img').getAttribute('src')).toContain('copper-wall-venue');
    await expect(copper).toContainText('Fort Worth, TX');
    await copper.scrollIntoViewIfNeeded();
    await expect.poll(() => copper.locator('img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
    await copper.locator('img').evaluate(img => img.decode());
    await page.waitForTimeout(150);
    await capture(page, `copper-${width}`, 'copper-photo-and-fort-worth-caption');
  });
  await run(`home-nojs-${width}`, { javaScriptEnabled: false, viewport: { width, height } }, async page => {
    await page.goto(origin);
    await painted(page.getByRole('link', { name: /Socials/ }).first());
    expect(await page.locator('a[href="/projects"]').count()).toBe(0);
  });
}
for (const [width, height] of [[390, 844], [320, 740], [390, 568]]) {
  await run(`mobile-menu-${width}-${height}`, { hasTouch: true, isMobile: true, viewport: { width, height } }, async page => {
    await page.goto(origin);
    await page.getByRole('button', { name: 'Open menu' }).tap();
    const dialog = page.getByRole('dialog', { name: 'Navigation menu' });
    await expect(dialog).toBeVisible();
    const boundary = await dialog.boundingBox();
    expect(boundary.y + boundary.height).toBeGreaterThanOrEqual(height);
    await expect(page.locator('#main-content')).toHaveAttribute('inert', '');
    for (let i = 0; i < 18; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    }
    await capture(page, `menu-open-${width}-${height}`, 'native-mobile-menu-open');
    await capture(page, `mobile-menu-${width}-${height}`, 'native-mobile-menu-open-summary');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
    await expect(page.locator('#main-content')).not.toHaveAttribute('inert', '');
    await page.getByRole('button', { name: 'Open menu' }).tap();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    await capture(page, `menu-resized-desktop-from-${width}-${height}`, 'menu-closed-after-desktop-resize');
  });
}
const post = { id: 'fixture-post', agent_id: 'fixture-agent', agent_name: 'Fixture agent', agent_website: '', agent_photo_url: '', owner: '', content: 'Controlled feed post', image_url: null, upvote_count: 0, user_upvoted: false, comment_count: 1, created_at: new Date().toISOString(), agent_post_count: 1, agent_last_active: new Date().toISOString(), agent_capability_tag: '' };
const comment = text => ({ id: text, post_id: post.id, content: text, created_at: new Date().toISOString(), agent: null });
await run('feed-refresh-closed-and-race', {}, async (page, context) => {
  await page.clock.install();
  let revision = 0, reads = 0, release;
  await context.route(origin + '/api/community/feed', r => r.fulfill({ json: [{ ...post, comment_count: revision + 1 }] }));
  await context.route(origin + '/api/community/comments?*', async r => {
    reads++;
    const current = revision;
    if (current === 1) await new Promise(resolve => { release = resolve; });
    await r.fulfill({ json: [comment(`Comment revision ${current}`)] });
  });
  await page.goto(origin + '/community');
  await expect(page.getByText('Comment revision 0', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Collapse comments/ }).click();
  revision = 1;
  await page.clock.fastForward(60001);
  await expect.poll(() => reads).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('button', { name: /Expand comments/ })).toHaveAttribute('aria-expanded', 'false');
  revision = 2;
  await page.clock.fastForward(60001);
  await expect.poll(() => reads).toBeGreaterThanOrEqual(3);
  await page.getByRole('button', { name: /Expand comments/ }).click();
  await expect(page.getByText('Comment revision 2', { exact: true })).toBeVisible();
  release();
  await page.waitForTimeout(200);
  await expect(page.getByText('Comment revision 2', { exact: true })).toBeVisible();
  await expect(page.getByText('Comment revision 1', { exact: true })).toHaveCount(0);
});
await run('comment-open-close-held-read', {}, async (page, context) => {
  let release, reads = 0;
  await context.route(origin + '/api/community/feed', r => r.fulfill({ json: [{ ...post, comment_count: 0 }] }));
  await context.route(origin + '/api/community/comments?*', async r => {
    reads++;
    await new Promise(resolve => { release = resolve; });
    await r.fulfill({ json: [comment('Held comment')] });
  });
  await page.goto(origin + '/community');
  await page.getByRole('button', { name: /Expand comments/ }).click();
  await expect(page.getByRole('button', { name: /Collapse comments/ })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: /Collapse comments/ }).click();
  release();
  await page.waitForTimeout(200);
  await expect(page.getByRole('button', { name: /Expand comments/ })).toHaveAttribute('aria-expanded', 'false');
  expect(reads).toBe(1);
});
await run('comment-error-recovery', {}, async (page, context) => {
  let failed = true;
  await context.route(origin + '/api/community/feed', r => r.fulfill({ json: [post] }));
  await context.route(origin + '/api/community/comments?*', r => failed ? r.fulfill({ status: 503, json: {} }) : r.fulfill({ json: [comment('Recovered comment')] }));
  await page.goto(origin + '/community');
  await expect(page.locator('main')).toContainText('Unable to load comments');
  await expect(page.getByText('No comments yet.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Collapse comments/ }).click();
  failed = false;
  await page.getByRole('button', { name: /Expand comments/ }).click();
  await expect(page.getByText('Recovered comment', { exact: true })).toBeVisible();
});
if (process.env.UI_PROFILE_FIXTURE === '1' || process.env.UI_PROFILE_SERVING === '1') {
  // Disposable local D1 fixture only; never a production migration or API write.
  // These tables contain synthetic public rows, no credentials/private inquiries.
  const sql = `CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, name TEXT, description TEXT, owner TEXT, website TEXT, github TEXT, discord TEXT, linkedin TEXT, photo_url TEXT, muted INTEGER, muted_until TEXT, skills TEXT, location TEXT, availability TEXT, created_at TEXT, last_seen TEXT);
  CREATE TABLE IF NOT EXISTS public_posts (id TEXT PRIMARY KEY, agent_id TEXT, content TEXT, image_url TEXT, parent_id TEXT, created_at TEXT);
  CREATE TABLE IF NOT EXISTS public_comments (id TEXT PRIMARY KEY, post_id TEXT);
  CREATE TABLE IF NOT EXISTS follows (following_id TEXT, follower_id TEXT);
  CREATE TABLE IF NOT EXISTS upvotes (post_id TEXT);
  INSERT OR IGNORE INTO agents VALUES ('ui-contract-agent','Synthetic UI Agent','Disposable local fixture','','','','','','',0,NULL,'[]','DFW','active','2026-10-12T00:00:00Z',NULL);
  INSERT OR IGNORE INTO public_posts VALUES ('ui-contract-post','ui-contract-agent','Synthetic profile post',NULL,NULL,'2026-10-12T00:00:00Z');`;
  if (process.env.UI_PROFILE_SERVING !== '1') execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'agentbuildersclub', '--local', '--command', sql], { stdio: 'pipe', timeout: 60000 });
  await run('profile-held-read-close', {}, async (page, context) => {
    let release;
    await context.route(origin + '/api/community/comments?*', async r => {
      await new Promise(resolve => { release = resolve; });
      await r.fulfill({ json: [{ ...comment('Held profile comment'), post_id: 'ui-contract-post' }] });
    });
    await page.goto(origin + '/community/agents/ui-contract-agent');
    await expect(page.getByRole('heading', { name: 'Synthetic UI Agent' })).toBeVisible();
    await page.getByRole('button', { name: /Expand comments/ }).click();
    await expect(page.getByRole('button', { name: /Collapse comments/ })).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', { name: /Collapse comments/ }).click();
    release();
    await page.waitForTimeout(200);
    await expect(page.getByRole('button', { name: /Expand comments/ })).toHaveAttribute('aria-expanded', 'false');
  });
  await run('profile-error-and-reopen-freshness', {}, async (page, context) => {
    let revision = -1;
    await context.route(origin + '/api/community/comments?*', r => revision < 0 ? r.fulfill({ status: 503, json: {} }) : r.fulfill({ json: [{ ...comment(`Profile revision ${revision}`), post_id: 'ui-contract-post' }] }));
    await page.goto(origin + '/community/agents/ui-contract-agent');
    await page.getByRole('button', { name: /Expand comments/ }).click();
    await expect(page.locator('main')).toContainText('Unable to load comments');
    await expect(page.getByText('No comments yet.', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: /Collapse comments/ }).click();
    revision = 0;
    await page.getByRole('button', { name: /Expand comments/ }).click();
    await expect(page.getByText('Profile revision 0', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Collapse comments/ }).click();
    revision = 1;
    await page.getByRole('button', { name: /Expand comments/ }).click();
    await expect(page.getByText('Profile revision 1', { exact: true })).toBeVisible();
    await expect(page.getByText('Profile revision 0', { exact: true })).toHaveCount(0);
  });
  await run('profile-nojs-post-painted', { javaScriptEnabled: false }, async page => {
    await page.goto(origin + '/community/agents/ui-contract-agent');
    await painted(page.getByText('Synthetic profile post', { exact: true }));
  });
}
await run('calendar-readable-fallback', { javaScriptEnabled: false }, async page => {
  await page.goto(origin + '/events');
  await painted(page.locator('main a[href="https://luma.com/agentbuildersclub"]').first());
});
await browser.close();
const cases = results.filter(r => r.status !== 'MEASUREMENT');
const profileIncluded = cases.some(r => r.name.startsWith('profile-'));
await writeFile(path.join(out, 'capture-manifest.json'), JSON.stringify({ source, sourceHash, origin, captures }, null, 2));
await writeFile(path.join(out, 'results.json'), JSON.stringify({ source, sourceHash, origin, scope: profileIncluded ? '22-case suite including local profile fixture' : '19-case non-profile subset; profile not exercised', caseCount: cases.length, profileIncluded, results }, null, 2));
process.exitCode = results.some(r => r.status === 'FAIL') ? 1 : 0;
