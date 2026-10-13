// Predeclared pipeline failures: unpopulated build, stale/missing assets, public cache
// disclosure, internal ASSETS denial, HTML/RSC/HEAD drift, dynamic/auth caching.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy } from 'wrangler';
import { chromium, expect } from '@playwright/test';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.env.ABC_STATIC_OUTPUT || resolve(root, 'artifacts/static-cache'));
mkdirSync(out, { recursive: true });
const report = { verdict: 'RED', boundary: 'normal build assets + exact compiled Worker fixture', cases: [], paths: [] };
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(resolve(dir, e.name)) : [resolve(dir, e.name)]); }
async function check(name, fn) { try { await fn(); report.cases.push({ name, verdict: 'PASS' }); } catch (e) { report.cases.push({ name, verdict: 'FAIL', reason: e.message, cause: String(e.cause || '') }); } }
const cache = resolve(root, '.open-next/cache');
const assets = resolve(root, '.open-next/assets');
let paths = [], proxy;
await check('normal-build-populates-every-current-cache-asset', async () => {
  paths = files(cache).map(p => ({ file: p, path: '/cdn-cgi/_next_cache/' + relative(cache, p) }));
  assert(paths.length > 0, 'No generated cache');
  for (const p of paths) assert.deepEqual(readFileSync(resolve(assets, '.' + p.path)), readFileSync(p.file), 'Missing/stale populated cache: ' + p.path);
  report.paths = paths.map(p => p.path);
});
if (!process.argv.includes('--artifact-only')) {
  const base = process.env.ABC_MAINTENANCE_BASE_URL;
  assert(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Disposable loopback fixture required');
  await check('all-actual-public-cache-paths-denied-internal-ASSETS-readable', async () => {
    const scratch = mkdtempSync(resolve(process.env.TMPDIR, 'abc-static-assets-'));
    const configPath = resolve(scratch, 'wrangler.json');
    // Asset policy is read from shipping source, never a test-only protection mirror.
    const source = JSON.parse(readFileSync(resolve(root, 'wrangler.jsonc')));
    // Internal binding-only proxy: no public request router. The running compiled
    // fixture above uses the shipping asset policy; ASSETS itself stays readable.
    writeFileSync(configPath, JSON.stringify({ name: 'abc-static-local', compatibility_date: source.compatibility_date, assets: { binding: source.assets.binding, directory: assets } }));
    for (const p of paths) {
      const publicResponse = await fetch(base + p.path, { redirect: 'manual' });
      report.publicResponses ||= [];
      report.publicResponses.push({ path: p.path, status: publicResponse.status, location: publicResponse.headers.get('location'), url: publicResponse.url });
      await publicResponse.text();
      assert.equal(publicResponse.status, 404, 'Public cache disclosed: ' + p.path);
    }
    proxy = await getPlatformProxy({ configPath, envFiles: [], remoteBindings: false, persist: false });
    for (const p of paths) {
      const internal = await proxy.env.ASSETS.fetch('http://assets.local' + p.path);
      assert.equal(internal.status, 200, 'Internal ASSETS denied');
      assert.equal(await internal.text(), readFileSync(p.file, 'utf8'));
    }
  });
  await check('cached-HTML-RSC-prefetch-HEAD-and-security-policy', async () => {
    const entry = JSON.parse(readFileSync(paths.find(p => p.file.endsWith('/terms.cache')).file));
    for (const headers of [{}, { RSC: '1' }, { RSC: '1', 'next-router-prefetch': '1' }]) {
      const r = await fetch(base + '/terms', { headers }); const body = await r.text();
      assert.equal(r.status, 200); assert.match(r.headers.get('cache-control'), /s-maxage=31536000/);
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(r.headers.get('x-frame-options'), 'DENY');
      assert.match(r.headers.get('vary'), /RSC/i);
      assert.equal(body, headers.RSC ? entry.rsc : entry.html, 'Response not exact prerender cache bytes');
    }
    const head = await fetch(base + '/terms', { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(await head.text(), '');
  });
  await check('native-client-navigation-uses-static-RSC', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    try {
      await context.tracing.start({ screenshots: true, snapshots: true });
      await context.route('**/*', r => new URL(r.request().url()).origin === base && ['GET', 'HEAD'].includes(r.request().method()) ? r.continue() : r.abort());
      const page = await context.newPage();
      const requests = [];
      page.on('request', r => { if (new URL(r.url()).pathname === '/terms') requests.push({ headers: r.headers(), navigation: r.isNavigationRequest() }); });
      await page.goto(base + '/privacy');
      await page.getByRole('link', { name: 'Terms', exact: true }).click();
      await expect(page).toHaveURL(base + '/terms');
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Terms');
      assert(requests.some(r => r.headers.rsc === '1' && !r.navigation), 'No native RSC client navigation');
      report.clientNavigation = requests;
      await page.screenshot({ path: resolve(out, 'client-navigation.png') });
      await context.tracing.stop({ path: resolve(out, 'client-navigation.zip') });
    } finally { await context.close(); await browser.close(); }
  });
  await check('dynamic-profile-and-invalid-auth-stay-private-not-prerendered', async () => {
    assert(!paths.some(p => p.file.includes('/community/agents/fixture-agent')));
    const r = await fetch(base + '/community/agents/fixture-agent');
    assert.equal(r.status, 200); assert.match(await r.text(), /Fixture &amp; Agent/);
    assert.match(r.headers.get('cache-control'), /private|no-store/);
    const invalid = await fetch(base + '/api/community/agents/fixture-agent', { headers: { 'x-api-key': 'synthetic-invalid' } });
    assert.equal(invalid.status, 401); assert.match(invalid.headers.get('cache-control'), /no-store/); await invalid.text();
  });
}
await proxy?.dispose();
report.verdict = report.cases.every(c => c.verdict === 'PASS') ? 'GREEN' : 'RED';
writeFileSync(resolve(out, 'results.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.verdict === 'GREEN' ? 0 : 1;
