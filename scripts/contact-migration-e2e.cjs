/* Browser contract, specified before the contact page.
 * Failure inventory: missing route/navigation; unlabeled/invalid/oversized fields;
 * honeypot exposed to keyboard/AT; double submission; editable pending payload;
 * network/API failure clears draft or claims delivery; queued save claims delivery;
 * missing email fallback; mobile overflow; inaccessible status.
 * No API/persistence mocks. Only the organizer's external mail provider may be
 * replaced by the parent integration environment. Full mode needs real local D1.
 * Run: CONTACT_BASE_URL=http://127.0.0.1:3249 CONTACT_TEST_MODE=ui node scripts/contact-migration-e2e.cjs
 * Modes: red (404 baseline), ui (form/navigation/network-error), full (real API).
 */
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const baseURL = process.env.CONTACT_BASE_URL || 'http://127.0.0.1:3249';
const mode = process.env.CONTACT_TEST_MODE || 'ui';
const parsedBase = new URL(baseURL);
if (parsedBase.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsedBase.hostname) || parsedBase.username || parsedBase.password || parsedBase.search || parsedBase.hash || parsedBase.pathname !== '/') throw new Error('Contact runner requires a disposable loopback origin before browser launch');
if (!['red', 'ui', 'full'].includes(mode)) throw new Error('Invalid contact test mode');
if (mode === 'full' && process.env.ABC_CONTACT_DISPOSABLE !== '1') throw new Error('Full contact mode requires ABC_CONTACT_DISPOSABLE=1 for an owned disposable loopback D1/mail runtime');
if (Object.keys(process.env).some(name => /^SMTP_|SUPABASE|DATABASE_URL/.test(name))) throw new Error('Contact runner refuses provider credentials; use a disposable loopback mail boundary');
const out = process.env.CONTACT_ARTIFACT_DIR || path.join(process.env.TMPDIR || require('node:os').tmpdir(), `abc-contact-${mode}-${Date.now()}`);
(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== parsedBase.origin || (!['GET', 'HEAD'].includes(request.method()) && !(mode === 'full' && url.pathname === '/api/contact' && request.method() === 'POST'))) await route.abort('blockedbyclient');
    else await route.continue();
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  const results = { mode, baseURL, checks: [], artifactDir: out };
  async function check(name, fn) { await fn(); results.checks.push({ name, status: 'PASS' }); }
  try {
    const response = await page.goto(`${baseURL}/contact`);
    results.httpStatus = response.status();
    await check('contact route exists (RED baseline is 404)', async () => expect(response.status()).toBe(200));
    if (mode === 'red') throw new Error('RED mode unexpectedly found an implemented contact route');
    await check('navigation, main, footer and fallback', async () => {
      await expect(page.getByRole('heading', { name: 'Contact', exact: true })).toBeVisible();
      await expect(page.locator('main#main-content')).toBeVisible();
      await expect(page.locator('footer')).toBeVisible();
      await expect(page.getByRole('link', { name: 'hello@agentbuildersclub.dev', exact: true }).first()).toHaveAttribute('href', 'mailto:hello@agentbuildersclub.dev');
      await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      await expect(page.locator('nav').getByRole('link', { name: 'Contact', exact: true }).last()).toHaveAttribute('href', '/contact');
      await page.getByRole('button', { name: 'Close menu', exact: true }).click();
    });
    const name = page.getByLabel('Name', { exact: true });
    const email = page.getByLabel('Email', { exact: true });
    const topic = page.getByLabel('Topic', { exact: true });
    const message = page.getByLabel('Message', { exact: true });
    const submit = page.getByRole('button', { name: 'Send message', exact: true });
    let requests = 0;
    page.on('request', r => { if (r.url().endsWith('/api/contact') && r.method() === 'POST') requests++; });
    await check('labels, limits, topic choices and hidden honeypot', async () => {
      await expect(name).toHaveAttribute('maxlength', '100');
      await expect(email).toHaveAttribute('maxlength', '254');
      await expect(message).toHaveAttribute('maxlength', '5000');
      expect(await topic.locator('option').evaluateAll(nodes => nodes.map(n => n.value))).toEqual(['attendee', 'sponsor', 'venue', 'presenting', 'other']);
      const trap = page.locator('input[name="website"]');
      await expect(trap).toHaveAttribute('tabindex', '-1');
      expect(await trap.evaluate(el => !!el.closest('[hidden], [aria-hidden="true"]'))).toBe(true);
    });
    await check('native validation prevents empty and invalid email requests', async () => {
      await submit.click(); expect(requests).toBe(0);
      await name.fill('Contact browser contract'); await email.fill('not-an-email'); await message.fill('Local E2E inquiry.');
      await submit.click(); expect(requests).toBe(0);
    });
    await email.fill(`contact-e2e-${Date.now()}@example.com`);
    await topic.selectOption('presenting');
    await check('real network failure preserves draft and offers fallback', async () => {
      await context.setOffline(true);
      await submit.click();
      await expect(page.locator('form').getByRole('alert')).toContainText(/unable|could not|try again/i);
      await expect(message).toHaveValue('Local E2E inquiry.');
      await expect(submit).toBeEnabled();
      await expect(page.getByRole('status')).not.toContainText(/delivered|sent successfully/i);
      await context.setOffline(false);
    });
    await check('mobile and desktop painted content has no horizontal overflow', async () => {
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await expect(name).toBeVisible();
        await page.screenshot({ path: path.join(out, `contact-${width}.png`), fullPage: true });
      }
    });
    if (mode === 'full') {
      await check('pending blocks duplicate sends; real API status is honest', async () => {
        // Delay forwarding the real request, never fulfill or replace the API.
        await page.route(`${parsedBase.origin}/api/contact`, async route => { await new Promise(resolve => setTimeout(resolve, 700)); await route.continue(); });
        const before = requests;
        const responsePromise = page.waitForResponse(r => r.url().endsWith('/api/contact') && r.request().method() === 'POST');
        await submit.click();
        await expect(page.getByRole('button', { name: 'Sending…', exact: true })).toBeDisabled();
        await expect(name).toBeDisabled(); await expect(topic).toBeDisabled();
        await page.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
        const apiResponse = await responsePromise;
        const payload = await apiResponse.json();
        results.api = { status: apiResponse.status(), notification_status: payload.notification_status };
        expect(requests - before).toBe(1);
        results.pendingAndDuplicateGuard = 'PASS';
        if (!apiResponse.ok()) {
          await expect(page.locator('form').getByRole('alert')).toContainText(/unable|too many/i);
          await expect(message).toHaveValue('Local E2E inquiry.');
          await expect(submit).toBeEnabled();
          await expect(page.getByRole('status')).not.toContainText(/delivered|received|saved|queued/i);
          results.realApiFailureState = 'PASS';
        }
        expect(apiResponse.ok(), 'Full contract needs actual local D1 persistence and mail boundary').toBe(true);
        const status = page.getByRole('status');
        await expect(status).toContainText(/received|saved|queued|delivered/i);
        if (payload.notification_status === 'delivered') await expect(status).toContainText(/delivered/i);
        else await expect(status).not.toContainText(/notification delivered|email sent|sent successfully/i);
      });
    } else results.notRun = ['real D1 persistence / successful notification / pending real API (run full mode)'];
    results.status = 'PASS';
  } catch (error) {
    results.status = 'FAIL'; results.error = String(error.stack || error);
    await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await context.tracing.stop({ path: path.join(out, 'trace.zip') });
    await browser.close();
    await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  }
})().catch(async error => {
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ status: 'BLOCKED', mode, baseURL, checks: [], error: error.message }, null, 2));
  console.error(error); process.exitCode = 1;
});
