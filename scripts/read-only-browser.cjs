// Maintained safety adapter. Assertions remain in the callers; no API fixture.
const { chromium } = require('@playwright/test');
function localOrigin(base) {
  const url = new URL(base);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('Read-only maintenance requires an explicit disposable loopback origin');
  return url.origin;
}
async function launchReadOnly(base, options = {}) {
  const origin = localOrigin(base);
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  try {
    const context = await browser.newContext({ ...options, serviceWorkers: 'block' });
    context.readOnlyEvidence = { writes: [], errors: [] };
    context.on('page', page => page.on('pageerror', error => context.readOnlyEvidence.errors.push(error.message)));
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === origin && !['GET', 'HEAD'].includes(request.method())) {
        context.readOnlyEvidence.writes.push({ method: request.method(), pathname: url.pathname });
        await route.abort('blockedbyclient');
      } else if (url.origin !== origin) await route.abort('blockedbyclient');
      else await route.continue();
    });
    return { browser, context };
  } catch (error) { await browser.close(); throw error; }
}
module.exports = { launchReadOnly, localOrigin };
