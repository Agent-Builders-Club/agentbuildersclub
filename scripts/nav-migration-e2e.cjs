/* Navigation acceptance contract (declared before implementation).
 * Failures: wrong primary order/URLs, crowded desktop links, hidden community
 * URLs, Discord replacing Luma CTA, missing Contact, logo loss, mobile overflow,
 * focus escaping an open menu, Escape/close/link leaving stale focus or menu,
 * resizing leaving background scroll locked or hidden focused controls.
 * Run: NAV_E2E_BASE_URL=http://127.0.0.1:3319 NAV_E2E_OUTPUT=<scratch>/red
 *      node scripts/nav-migration-e2e.cjs
 * Requires an already running isolated Next server; never builds or installs.
 * External Luma/Discord destinations are inspected, not opened or submitted.
 */
const { expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const baseURL = process.env.NAV_E2E_BASE_URL;
if (!baseURL || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(baseURL)) throw new Error('An explicit local NAV_E2E_BASE_URL is required');
const output = process.env.NAV_E2E_OUTPUT;
if (!output) throw new Error('NAV_E2E_OUTPUT is required for durable artifacts');
fs.mkdirSync(output, { recursive: true });
const primary = [['Events', '/events'], ['Get Involved', '/get-involved'], ['Contact', '/contact']];
const secondary = [['Community', '/community'], ['Agents', '/community/agents'], ['Skills', '/skills']];
(async () => {
  const { browser, context } = await require('./read-only-browser.cjs').launchReadOnly(baseURL, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  const cases = [];
  async function test(name, action) {
    try { await action(); cases.push({ name, status: 'passed' }); }
    catch (error) { cases.push({ name, status: 'failed', error: error.message }); }
    await page.screenshot({ path: path.join(output, `${cases.length}.png`) }).catch(() => {});
  }
  async function load(width, height = 900) {
    await page.setViewportSize({ width, height });
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await expect(page.locator('nav').first()).toBeVisible();
  }
  const nav = () => page.locator('nav').first();
  async function links(scope, entries) {
    for (const [name, href] of entries) {
      const link = scope.getByRole('link', { name, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', href);
    }
  }
  async function fit(scope) {
    const failures = await scope.locator('a:visible, button:visible, summary:visible').evaluateAll(elements => elements.flatMap(el => {
      const r = el.getBoundingClientRect();
      return r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1 || !r.width || !r.height ? [el.textContent || el.getAttribute('aria-label')] : [];
    }));
    expect(failures, 'interactive navigation must fit the viewport').toEqual([]);
  }
  await test('Meetup-first primary order and Luma CTA, logo retained', async () => {
    await load(1440);
    await links(nav(), primary);
    const hrefs = await nav().locator('a:visible').evaluateAll(els => els.map(el => el.getAttribute('href')));
    expect(hrefs.filter(href => primary.some(([, value]) => value === href))).toEqual(primary.map(([, href]) => href));
    await expect(nav().getByRole('link', { name: 'Join on Luma', exact: true })).toHaveAttribute('href', 'https://luma.com/agentbuildersclub');
    await expect(nav().getByRole('link', { name: 'Agent Builders Club home' }).locator('img')).toHaveAttribute('alt', 'Agent Builders Club');
    await fit(nav());
  });
  await test('Secondary links discoverable but not crowded into primary row; keyboard dismissal', async () => {
    await load(1440);
    const toggle = nav().getByRole('button', { name: 'Community links', exact: true });
    for (const [name] of secondary) await expect(nav().getByRole('link', { name, exact: true })).not.toBeVisible();
    await toggle.focus(); await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await links(nav(), secondary);
    await expect(nav().getByRole('link', { name: 'Join Discord', exact: true })).toHaveAttribute('href', 'https://discord.gg/q8kEquTu3z');
    await fit(nav());
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
  });
  await test('Contact navigates to working Contact page', async () => {
    await load(1440);
    await nav().getByRole('link', { name: 'Contact', exact: true }).click();
    await expect(page).toHaveURL(`${baseURL}/contact`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('404');
  });
  for (const width of [320, 390, 768, 1024, 1280]) await test(`Responsive fit and accessible mobile menu at ${width}px`, async () => {
    await load(width, 740);
    const toggle = nav().getByRole('button', { name: 'Open menu', exact: true });
    if (!(await toggle.isVisible())) { await links(nav(), primary); await fit(nav()); return; }
    await toggle.click();
    const close = nav().getByRole('button', { name: 'Close menu', exact: true });
    await expect(close).toHaveAttribute('aria-expanded', 'true');
    const menu = page.locator('#mobile-navigation');
    await links(menu, primary); await links(menu, secondary);
    await expect(menu.getByRole('link', { name: 'Join on Luma', exact: true })).toHaveAttribute('href', 'https://luma.com/agentbuildersclub');
    await fit(nav());
    await expect(menu.getByRole('link', { name: 'Events', exact: true })).toBeFocused();
    const count = await nav().locator('a:visible,button:visible').count();
    for (let i = 0; i < count + 2; i++) {
      await page.keyboard.press('Tab');
      expect(await nav().evaluate(el => el.contains(document.activeElement)), 'focus must remain within open navigation').toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0); await expect(toggle).toBeFocused();
    await toggle.click(); await close.click(); await expect(toggle).toBeFocused();
    await toggle.click(); await menu.getByRole('link', { name: 'Contact', exact: true }).click();
    await expect(page).toHaveURL(`${baseURL}/contact`); await expect(menu).toHaveCount(0);
    await toggle.click(); await page.setViewportSize({ width: 1440, height: 900 });
    await expect(menu).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  });
  await test('no page exceptions or attempted writes', async () => { expect(context.readOnlyEvidence).toEqual({ writes: [], errors: [] }); });
  await context.tracing.stop({ path: path.join(output, 'trace.zip') });
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ baseURL, cases, passed: cases.every(c => c.status === 'passed'), exclusions: ['External Luma/Discord availability', 'Contact submission/delivery', 'Parent-owned final production/build gates'] }, null, 2));
  await browser.close();
  console.log(JSON.stringify(cases, null, 2));
  process.exitCode = cases.every(c => c.status === 'passed') ? 0 : 1;
})().catch(error => { fs.writeFileSync(path.join(output, 'fatal.json'), JSON.stringify({ error: error.message })); console.error(error); process.exitCode = 1; });
