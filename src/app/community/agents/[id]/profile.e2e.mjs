/*
 * Production E2E failure modes (defined before implementation):
 * known ID returns a client-only placeholder, generic title/home canonical,
 * missing landmarks or duplicate mains, private key leakage; unknown ID returns
 * 200; comments/key controls stop working after hydration; fixture accepts writes.
 * Run after build: node 'src/app/community/agents/[id]/profile.e2e.mjs'
 * No production database is contacted. The local PostgREST fixture rejects writes.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const id = 'fixture-agent';
const secret = 'PRIVATE_FIXTURE_API_KEY_DO_NOT_RENDER';
const origin = 'https://www.agentbuildersclub.dev';
const agent = { id, name: 'Fixture & Agent', description: 'A public fixture profile for crawlers.', owner: 'Fixture Owner', website: '', github: '', discord: '', linkedin: '', photo_url: '', skills: ['Research'], location: 'Remote', availability: 'active', created_at: '2025-01-01T00:00:00Z', muted: false, api_key: secret };
const post = { id: 'fixture-post', content: 'Fixture post content for crawlers.', image_url: null, created_at: '2025-01-02T00:00:00Z' };
const fixtureRequests = [];
const fixture = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  fixtureRequests.push(`${req.method} ${url.pathname}${url.search}`);
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET' && !(req.method === 'POST' && url.pathname === '/rest/v1/rpc/community_post_counts')) {
    res.writeHead(405).end(JSON.stringify({ message: 'read-only fixture' })); return;
  }
  if (url.pathname === '/rest/v1/agents') {
    const found = url.searchParams.get('id') === `eq.${id}`;
    if (!found) { res.writeHead(406).end(JSON.stringify({ code: 'PGRST116', message: 'The result contains 0 rows' })); return; }
    res.end(JSON.stringify(Object.fromEntries(Object.entries(agent).filter(([key]) => key !== 'api_key')))); return;
  }
  if (url.pathname === '/rest/v1/posts') { res.end(JSON.stringify([post])); return; }
  if (url.pathname === '/rest/v1/rpc/community_post_counts') { res.end(JSON.stringify([{ post_id: post.id, upvote_count: 2, comment_count: 1 }])); return; }
  if (url.pathname === '/rest/v1/comments') { res.end(JSON.stringify([{ id: 'fixture-comment', post_id: post.id, content: 'Fixture comment', created_at: post.created_at, agents: { id, name: agent.name, website: '', photo_url: '', owner: agent.owner } }])); return; }
  res.writeHead(404).end('{}');
});
const listen = (server) => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const fixturePort = await listen(fixture);
const probe = createServer((_req, res) => res.end());
const appPort = await listen(probe);
await new Promise(resolve => probe.close(resolve));
const app = spawn(join(process.cwd(), 'node_modules/.bin/next'), ['start', '-p', String(appPort)], {
  env: { ...process.env, SUPABASE_URL: `http://127.0.0.1:${fixturePort}`, SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key', NEXT_PUBLIC_BASE_URL: origin },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
for (const stream of [app.stdout, app.stderr]) stream.on('data', chunk => { logs += chunk.toString(); });
const base = `http://127.0.0.1:${appPort}`;
async function ready() {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (app.exitCode !== null) throw new Error(`next start exited: ${logs}`);
    try { const res = await fetch(`${base}/community/agents/${id}`); if (res.status) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`next start timed out: ${logs}`);
}
const checks = [];
function check(name, fn) { fn(); checks.push(name); }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function browserSmoke() {
  const profileDir = await mkdtemp(join(tmpdir(), 'abc-profile-chromium-'));
  const browser = spawn('chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, 'about:blank'], { stdio: 'ignore' });
  let socket;
  try {
    let port;
    for (let i = 0; i < 100; i++) {
      try { port = Number((await readFile(join(profileDir, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await delay(100); }
    }
    assert.ok(port, 'Chromium CDP did not start');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let seq = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
      const response = JSON.parse(event.data);
      if (pending.has(response.id)) { pending.get(response.id)(response); pending.delete(response.id); }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, response => response.error ? reject(new Error(JSON.stringify(response.error))) : resolve(response.result));
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
    await send('Page.navigate', { url: `${base}/community/agents/${id}` });
    let hydrated = false;
    for (let i = 0; i < 100; i++) {
      hydrated = await evaluate(`!!document.querySelector('main h1') && document.body.innerText.includes('Fixture comment')`);
      if (hydrated) break;
      await delay(100);
    }
    check('hydrated comment fetched and profile identity visible', () => assert.equal(hydrated, true));
    const result = await evaluate(`(() => {
      const main = document.querySelector('main');
      const button = [...main.querySelectorAll('button')].find(b => b.textContent.trim() === 'Post');
      button.click();
      const comment = main.innerText.includes('Fixture comment');
      document.querySelector('a[href="#main-content"]').click();
      return { comment, skipTarget: location.hash, focusedMain: document.activeElement === main, mainCount: document.querySelectorAll('main').length };
    })()`);
    // React handles the event on the next turn.
    const alert = await evaluate(`document.querySelector('main [role="alert"]')?.textContent`);
    check('comment button requires key without sending a write', () => assert.match(alert, /Enter your agent API key/));
    check('skip link focuses unique main target', () => { assert.equal(result.skipTarget, '#main-content'); assert.equal(result.focusedMain, true); assert.equal(result.mainCount, 1); assert.equal(result.comment, true); });
  } finally {
    socket?.close(); browser.kill('SIGTERM'); await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
try {
  await ready();
  const known = await fetch(`${base}/community/agents/${id}`);
  const html = await known.text();
  check('known profile HTTP 200 and crawler-visible identity/content', () => {
    assert.equal(known.status, 200); assert.match(html, /Fixture &amp; Agent/); assert.match(html, /Fixture post content for crawlers/); assert.match(html, /A public fixture profile for crawlers/);
  });
  check('profile title, description, canonical', () => {
    assert.match(html, /<title>Fixture &amp; Agent \| Agent Builders Club<\/title>/);
    assert.equal((html.match(/<title>/g) ?? []).length, 1);
    assert.match(html, /<link rel="canonical" href="https:\/\/www\.agentbuildersclub\.dev\/community\/agents\/fixture-agent"/);
    assert.equal((html.match(/<link rel="canonical"/g) ?? []).length, 1);
    assert.match(html, /<meta name="description" content="A public fixture profile for crawlers\./);
  });
  check('one nav, main skip target, footer', () => {
    assert.equal((html.match(/<nav\b/g) ?? []).length, 1);
    assert.equal((html.match(/<main\b/g) ?? []).length, 1);
    assert.match(html, /<main[^>]*id="main-content"/);
    assert.equal((html.match(/<footer\b/g) ?? []).length, 1);
    assert.match(html, /href="#main-content"/);
  });
  check('public projection excludes API key', () => { assert.ok(!html.includes(secret)); assert.ok(!html.includes('api_key')); });
  const unknown = await fetch(`${base}/community/agents/no-such-agent`);
  const missingHtml = await unknown.text();
  check('unknown profile true HTTP 404 and branded recovery', () => {
    assert.equal(unknown.status, 404); assert.match(missingHtml, /Not Found/); assert.match(missingHtml, /Back to Home/);
  });
  await browserSmoke();
  check('fixture rejected any write', () => { assert.ok(fixtureRequests.every(request => request.startsWith('GET ') || request.startsWith('POST /rest/v1/rpc/community_post_counts'))); });
  const report = { checks, knownStatus: known.status, unknownStatus: unknown.status, fixtureRequests };
  const artifact = join(tmpdir(), 'abc-profile-production-e2e.json');
  await writeFile(artifact, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ artifact, ...report }, null, 2));
} finally {
  app.kill('SIGTERM'); fixture.close();
}
