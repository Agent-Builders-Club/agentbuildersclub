// Local-only Cloudflare Worker preview smoke; no Supabase credentials or writes.
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import './check-opennext-credentials.mjs';

const base = 'http://127.0.0.1:3218';
const dir = 'artifacts/opennext';
await mkdir(dir, { recursive: true });
const output = [];
const server = spawn('node_modules/.bin/opennextjs-cloudflare', ['preview', '--ip', '127.0.0.1', '--port', '3218'], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', chunk => output.push(chunk.toString()));
server.stderr.on('data', chunk => output.push(chunk.toString()));
const checks = [];
function assert(ok, description) {
  checks.push({ description, passed: !!ok });
  if (!ok) throw new Error(description);
}
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(`preview exited ${server.exitCode}`);
    try { const r = await fetch(`${base}/robots.txt`); if (r.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert(ready, 'local Wrangler preview ready');
  for (const [path, status, fragment] of [
    ['/', 200, 'Agent Builders Club'], ['/events', 200, 'Events'],
    ['/robots.txt', 200, 'Disallow: /api/'], ['/sitemap.xml', 200, '/events'],
    ['/llms.txt', 200, 'Agent Builders Club'], ['/missing-opennext-spike', 404, 'Not Found'],
  ]) {
    const r = await fetch(`${base}${path}`); const body = await r.text();
    assert(r.status === status && body.includes(fragment), `${path} status ${status} and body contract (got ${r.status})`);
  }
  const api = await fetch(`${base}/api/skills`);
  const apiBody = await api.json();
  assert(api.status === 500 && apiBody.error === 'Server error', `data-backed /api/skills unavailable without Supabase (got ${api.status})`);
  const image = await fetch(`${base}/_next/image?url=%2Fhero-lobster.webp&w=64&q=75`);
  assert(image.status === 200 && image.headers.get('content-type')?.startsWith('image/') && (await image.arrayBuffer()).byteLength > 100, 'local image optimization');
  const staticAsset = await fetch(`${base}/_next/static/css/not-real.css`);
  assert(staticAsset.status === 404, 'unknown static asset 404');
  const redirect = await new Promise((resolve, reject) => {
    import('node:http').then(({ get }) => get(`${base}/events?from=old`, { headers: { Host: 'clawplex.dev' } }, r => {
      r.resume(); resolve({ status: r.statusCode, location: r.headers.location });
    }).on('error', reject), reject);
  });
  assert(redirect.status === 308 && redirect.location === 'https://agentbuildersclub.dev/events?from=old', `legacy host redirect (got ${redirect.status} ${redirect.location})`);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.route('**/api/**', route => route.abort());
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:3218(?:\/|$)).*/, route => route.abort());
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const home = await page.goto(base, { waitUntil: 'networkidle' });
  assert(home.status() === 200 && await page.getByRole('heading', { level: 1 }).isVisible(), 'Chromium home rendered');
  await page.screenshot({ path: `${dir}/home.png`, fullPage: true });
  await page.locator('nav').getByRole('link', { name: 'Events' }).click();
  await page.waitForURL('**/events', { timeout: 10000 });
  assert(await page.getByRole('heading', { name: 'Events', exact: true, level: 1 }).isVisible(), `Chromium client navigation to events (got ${page.url()}, errors ${errors.join('; ')})`);
  assert(errors.length === 0, `no browser page errors: ${errors.join('; ')}`);
} catch (e) {
  checks.push({ description: String(e), passed: false });
  process.exitCode = 1;
} finally {
  await browser?.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch {}
  await writeFile(`${dir}/smoke.json`, JSON.stringify({ checks, passed: checks.every(c => c.passed) }, null, 2) + '\n');
  await writeFile(`${dir}/preview.log`, output.join(''));
  console.log(JSON.stringify({ checks, passed: checks.every(c => c.passed) }, null, 2));
}
