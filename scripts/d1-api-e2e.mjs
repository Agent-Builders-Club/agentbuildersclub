// Frozen before D1 implementation. Real HTTP -> production route modules -> local workerd D1.
// The harness substitutes ONLY SDK context acquisition and the notification transport;
// no SQL/query emulator and no production credentials. Full OpenNext runtime is a separate gate.
// Failure inventory: missing D1/config/deps; malformed/oversize JSON; digest/private leaks;
// missing/invalid/stale keys; CAS rotation races; duplicate names; mute/auth bypass;
// daily concurrent quota overflow; normalized repeats and conflicting idempotency;
// missing/hidden targets; parent leaks; hidden/muted count leaks; ownership bypass;
// vote/follow races; pending/flagged skill export; notification rejection/retry;
// contact privacy/honeypot; retired writes; data deletion; migration/FK drift.
import { createRequire } from 'node:module';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, symlinkSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const label = process.env.ABC_E2E_LABEL || 'green';
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Invalid evidence label');
const scratch = process.env.TMPDIR || resolve(root, '.wrangler', 'e2e-scratch');
const artifact = resolve(scratch, 'abc-d1-backend-e2e', label);
mkdirSync(artifact, { recursive: true });
if (!existsSync(resolve(artifact, 'node_modules'))) symlinkSync(resolve(root, 'node_modules'), resolve(artifact, 'node_modules'), 'dir');
const require = createRequire(resolve(root, 'package.json'));
const records = []; let server, mf, db;
const admin = randomBytes(32).toString('hex');
process.env.CLAWPLEX_ADMIN_API_KEY = admin;
for (const k of Object.keys(process.env)) if (/SUPABASE|CLOUDFLARE_API|CLAWPLEX_ADMIN_SECRET/.test(k)) delete process.env[k];
const assert = (ok, msg) => { if (!ok) throw Error(msg); };
const json = (body, key, extra = {}) => ({ method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { 'x-api-key': key } : {}), ...extra }, body: JSON.stringify(body) });
let base;
async function req(path, options = {}, status = 200) {
  const r = await fetch(base + path, { ...options, signal: AbortSignal.timeout(15000) });
  const text = await r.text(); let body; try { body = JSON.parse(text); } catch { body = text; }
  assert(r.status === status, `${path}: expected ${status}, got ${r.status}`);
  return body;
}
async function test(name, fn) { try { await fn(); records.push({ name, verdict: 'PASS' }); } catch (e) { records.push({ name, verdict: 'FAIL', reason: e.message }); throw e; } }
function routeFiles(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? routeFiles(resolve(dir, e.name)) : e.name === 'route.ts' ? [resolve(dir, e.name)] : []); }
try {
  // Load the already-installed Wrangler dependency graph; never install from this harness.
  const wrRequire = createRequire(require.resolve('wrangler'));
  const { Miniflare, convertV4MiniflareOptions } = await import(pathToFileURL(wrRequire.resolve('miniflare')));
  let esbuildPath; try { esbuildPath = wrRequire.resolve('esbuild'); } catch { esbuildPath = createRequire(require.resolve('vite')).resolve('esbuild'); }
  const { build } = await import(pathToFileURL(esbuildPath));
  const fixtureOptions = { workers: [{ name: 'abc-backend-fixture', modules: true, script: 'export default { fetch() { return new Response("fixture"); } }', d1Databases: ['DB'], compatibilityDate: '2026-10-01', compatibilityFlags: ['nodejs_compat'] }] };
  mf = new Miniflare(convertV4MiniflareOptions ? convertV4MiniflareOptions(fixtureOptions) : fixtureOptions);
  db = await mf.getD1Database('DB');
  const migrations = resolve(root, 'd1/migrations');
  try {
    for (const f of readdirSync(migrations).sort()) if (f.endsWith('.sql')) {
      // D1.exec splits by newline, so submit each complete schema statement via prepare.
      let statement = '';
      for (const line of readFileSync(resolve(migrations, f), 'utf8').split('\n')) {
        if (!line.trim() || line.trimStart().startsWith('--')) continue;
        statement += line + '\n';
        if (/^CREATE TRIGGER/i.test(statement.trimStart()) ? /^END;\s*$/.test(line) : /;\s*$/.test(line)) {
          await db.prepare(statement).run(); statement = '';
        }
      }
      assert(!statement.trim(), `Incomplete SQL in ${f}`);
    }
  }
  catch (e) { if (e.code !== 'ENOENT') { records.push({ name: 'migrations', verdict: 'FAIL', reason: e.message }); throw e; } }
  globalThis.__ABC_D1_E2E_CONTEXT = { env: { DB: db, CLAWPLEX_ADMIN_API_KEY: admin } };
  globalThis.__ABC_D1_E2E_NOTIFY_FAIL = true;
  const files = routeFiles(resolve(root, 'src/app/api'));
  const entry = files.map((f, i) => `import * as r${i} from ${JSON.stringify(f)};`).join('\n') + '\nexport const routes = [' + files.map((f, i) => `{path:${JSON.stringify('/' + f.slice(resolve(root, 'src/app').length + 1).replace(/\/route.ts$/, ''))},module:r${i}}`).join(',') + '];';
  await build({ stdin: { contents: entry, resolveDir: root, sourcefile: 'd1-http-fixture.ts', loader: 'ts' }, outfile: resolve(artifact, 'routes.cjs'), platform: 'node', format: 'cjs', bundle: true, packages: 'external', tsconfig: resolve(root, 'tsconfig.json'), plugins: [{ name: 'sdk-context-only', setup(b) {
    b.onResolve({ filter: /^@opennextjs\/cloudflare$/ }, () => ({ path: 'context', namespace: 'fixture' }));
    b.onResolve({ filter: /contact-delivery$/ }, () => ({ path: 'notify', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'context' ? 'export async function getCloudflareContext(){return globalThis.__ABC_D1_E2E_CONTEXT}' : 'export async function notifyContact(){if(globalThis.__ABC_D1_E2E_NOTIFY_FAIL)throw Error("fixture notification rejection");return {status:"accepted",messageId:"fixture-receipt"}}', loader: 'js' }));
  } }] });
  const { routes } = require(resolve(artifact, 'routes.cjs'));
  const { NextRequest } = require('next/server');
  server = createServer(async (incoming, outgoing) => {
    try {
      const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
      const url = new URL(incoming.url, base);
      let selected, params;
      for (const route of routes) {
        const names = []; const pattern = route.path.replace(/\[([^\]]+)\]/g, (_, name) => { names.push(name); return '([^/]+)'; });
        const matched = url.pathname.match(new RegExp('^' + pattern + '$'));
        if (matched) { selected = route.module; params = Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(matched[i + 1])])); break; }
      }
      const handler = selected?.[incoming.method];
      if (!handler) { outgoing.writeHead(404); outgoing.end('{}'); return; }
      const request = new NextRequest(url, { method: incoming.method, headers: incoming.headers, ...(!['GET', 'HEAD'].includes(incoming.method) ? { body: Buffer.concat(chunks) } : {}) });
      const response = await handler(request, { params: Promise.resolve(params) });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch { outgoing.writeHead(500); outgoing.end('{"error":"fixture boundary error"}'); }
  });
  await new Promise((yes, no) => { server.once('error', no); server.listen(33284, '127.0.0.1', yes); });
  base = 'http://127.0.0.1:33284';
  const suffix = randomBytes(5).toString('hex'); let a, b, key, post, comment, skill;
  // Policy contract declared before repair: exact case-folded name, exact website host,
  // exact project URL identity; no owner/repository-prefix/substring inference. Active
  // permanent/future mutes hide directory + profile, expired mutes restore both + feed.
  await test('known-meld-registration-and-active-mute-public-visibility', async () => {
    const failures = [];
    const expect = (ok, message) => { if (!ok) failures.push(message); };
    const count = async () => (await db.prepare('SELECT count(*) n FROM agents').first()).n;
    const before = await count();
    const blocked = [
      { name: ' MeLd ', website: 'https://example.org' },
      { name: `host-${suffix}`, website: 'https://MELD.mergeinc.workers.dev/path?x=1' },
      { name: `repo-${suffix}`, github: 'https://github.com/lemonaide152/meld' },
      { name: `repo-variant-${suffix}`, website: 'https://GITHUB.com/Lemonaide152/Meld/?tab=readme#top' },
    ];
    for (const [i, payload] of blocked.entries()) {
      const response = await fetch(base + '/api/community/register', json(payload, null, { 'cf-connecting-ip': `192.0.2.${30 + i}` }));
      expect(response.status === 403, `blocked identity ${i}: expected 403 got ${response.status}`);
      const responseBody = await response.json();
      expect(!responseBody.api_key, `blocked identity ${i} issued a credential`);
    }
    expect(await count() === before, 'blocked identities persisted agent rows');
    const controls = [
      { name: `meld-tools-${suffix}`, owner: 'lemonaide152', github: 'https://github.com/lemonaide152/useful-tool' },
      { name: `subdomain-${suffix}`, website: 'https://other.meld.mergeinc.workers.dev' },
      { name: `repo-prefix-${suffix}`, github: 'https://github.com/lemonaide152/meld-tools' },
    ];
    let visible;
    for (const [i, payload] of controls.entries()) visible = await req('/api/community/register', json(payload, null, { 'cf-connecting-ip': `192.0.2.${40 + i}` }), 201);
    const update = await req('/api/community/post', json({ content: 'Legitimate OSS update https://github.com/lemonaide152/useful-tool' }, visible.api_key), 201);
    const visibility = async (shown, state) => {
      expect((await req('/api/community/agents')).some(a => a.id === visible.id) === shown, `${state}: directory visibility`);
      const profile = await fetch(base + `/api/community/agents/${visible.id}`);
      expect(profile.status === (shown ? 200 : 404), `${state}: profile expected ${shown ? 200 : 404} got ${profile.status}`);
      expect((await req('/api/community/feed')).some(p => p.id === update.id) === shown, `${state}: feed visibility`);
    };
    await req(`/api/community/admin/mute/${visible.id}`, json({ muted: true }, visible.api_key), 401);
    await visibility(true, 'unauthorized mute');
    await req(`/api/community/admin/mute/${visible.id}`, json({ muted: true }, null, { 'x-admin-api-key': admin }));
    await visibility(false, 'permanent mute');
    await req(`/api/community/admin/mute/${visible.id}`, json({ muted: true, muted_until: new Date(Date.now() + 3600000).toISOString() }, null, { 'x-admin-api-key': admin }));
    await visibility(false, 'future mute');
    // Set local D1 clock-state fixture without waiting: retain muted=1, expire only deadline.
    await db.prepare('UPDATE agents SET muted_until=? WHERE id=?').bind('2000-01-01T00:00:00.000Z', visible.id).run();
    await visibility(true, 'expired mute');
    const profile = await req(`/api/community/agents/${visible.id}`);
    expect(!JSON.stringify(profile).includes(visible.api_key) && !JSON.stringify(profile).includes('api_key'), 'profile credential leak');
    expect(await db.prepare('SELECT id FROM agents WHERE id=?').bind(visible.id).first(), 'mute physically deleted agent');
    assert(failures.length === 0, failures.join('; '));
  });
  if (!process.env.ABC_E2E_POLICY_ONLY) {
  await test('register-digest-public-private-boundary', async () => {
    a = await req('/api/community/register', json({ name: `d1-${suffix}`, website: 'https://example.org', skills: ['D1'] }, null, { 'cf-connecting-ip': '192.0.2.1' }), 201); key = a.api_key;
    b = await req('/api/community/register', json({ name: `peer-${suffix}`, website: 'https://example.org' }, null, { 'cf-connecting-ip': '192.0.2.2' }), 201);
    const row = await db.prepare('SELECT api_key,api_key_hash FROM agents WHERE id=?').bind(a.id).first();
    // Assert the production digest of a freshly generated random bearer token, not password storage.
    //codeql[js/insufficient-password-hash]
    assert(row.api_key_hash === createHash('sha256').update(key).digest('hex') && row.api_key === row.api_key_hash, 'digest continuity');
    const directory = await req('/api/community/agents'); assert(!JSON.stringify(directory).includes(row.api_key_hash), 'digest leak');
    await req('/api/community/register', json({ name: `D1-${suffix}`, website: 'https://example.org' }, null, { 'cf-connecting-ip': '192.0.2.3' }), 409);
    await req('/api/community/feed', { headers: { 'x-api-key': 'invalid' } }, 401);
  });
  await test('bounded-validation-and-auth', async () => {
    await req('/api/community/post', json({ content: 'unauthorized' }), 401);
    await req('/api/community/post', { method: 'POST', headers: { 'x-api-key': key, 'content-type': 'application/json' }, body: '{' }, 400);
    await req('/api/community/post', json({ content: 'x'.repeat(33000) }, key), 413);
    await req('/api/community/post', json({ content: 'bad image', image_url: 'javascript:alert(1)' }, key), 400);
    await req('/api/community/post', json({ content: 'missing parent', parent_id: 'absent' }, key), 404);
  });
  await test('post-normalized-duplicate-idempotency-concurrent-quota', async () => {
    post = await req('/api/community/post', json({ content: 'Useful open source project https://example.org/tool' }, key, { 'idempotency-key': 'project-1' }), 201);
    const replay = await req('/api/community/post', json({ content: 'Useful open source project https://example.org/tool' }, key, { 'idempotency-key': 'project-1' }), 200); assert(replay.id === post.id, 'replay mismatch');
    await req('/api/community/post', json({ content: 'different bytes' }, key, { 'idempotency-key': 'project-1' }), 409);
    await req('/api/community/post', json({ content: '  USEFUL  open source PROJECT https://example.org/tool  ' }, key), 409);
    const statuses = await Promise.all(Array.from({ length: 8 }, (_, i) => fetch(base + '/api/community/post', json({ content: `distinct update ${i}` }, key)).then(r => r.status)));
    assert(statuses.filter(s => s === 201).length === 1 && statuses.filter(s => s === 429).length === 7, 'post quota overflow');
    const feed = await req('/api/community/feed'); assert(feed.some(p => p.id === post.id), 'project URL prohibited');
  });
  await test('comments-normalized-replay-and-concurrent-day-quota', async () => {
    comment = await req('/api/community/comments', json({ post_id: post.id, content: 'Useful tool thanks' }, b.api_key, { 'idempotency-key': 'reply-1' }), 201);
    assert((await req('/api/community/comments', json({ post_id: post.id, content: 'Useful tool thanks' }, b.api_key, { 'idempotency-key': 'reply-1' }), 200)).id === comment.id, 'comment replay');
    await req('/api/community/comments', json({ post_id: post.id, content: ' USEFUL tool  THANKS ' }, b.api_key), 409);
    const statuses = await Promise.all(Array.from({ length: 14 }, (_, i) => fetch(base + '/api/community/comments', json({ post_id: post.id, content: `separate reply ${i}` }, b.api_key)).then(r => r.status)));
    assert(statuses.filter(s => s === 201).length === 9 && statuses.filter(s => s === 429).length === 5, 'comment quota overflow');
  });
  await test('votes-follows-keyed-feed-profiles-and-report', async () => {
    assert((await req(`/api/community/upvote/${post.id}`, json({}, b.api_key))).upvoted, 'vote missing');
    assert((await req('/api/community/feed', { headers: { 'x-api-key': b.api_key } })).find(p => p.id === post.id).user_upvoted, 'keyed vote missing');
    assert(!(await req(`/api/community/upvote/${post.id}`, json({}, b.api_key))).upvoted, 'vote toggle');
    assert((await req(`/api/community/agents/${a.id}`, json({ action: 'follow' }, b.api_key))).following, 'follow missing');
    await req(`/api/community/agents/${a.id}`, json({ action: 'follow', viewer_id: a.id }, b.api_key), 403);
    assert((await req(`/api/community/agents/${a.id}`)).agent.follower_count === 1, 'follow count');
    await req(`/api/community/report/${post.id}`, json({}), 201);
  });
  await test('skills-pending-moderation-export-and-flag', async () => {
    skill = await req('/api/skills/submit', json({ name: 'fixture-skill', description: 'Useful fixture description', category: 'utility', trigger_phrases: ['fixture'], instructions: 'Follow these safe fixture instructions.' }, b.api_key), 201);
    await req(`/api/skills/${skill.id}/export`, {}, 404);
    await req('/api/skills/moderate', { ...json({ id: skill.id, action: 'approve' }), method: 'PATCH' }, 401);
    await req('/api/skills/moderate', { ...json({ id: skill.id, action: 'approve' }, null, { 'x-admin-api-key': admin }), method: 'PATCH' });
    assert((await req(`/api/skills/${skill.id}/export`)).format === 'clawpack-v1', 'export format');
    await req('/api/skills/moderate', { ...json({ id: skill.id, action: 'flag' }, null, { 'x-admin-api-key': admin }), method: 'PATCH' });
    await req(`/api/skills/${skill.id}/export`, {}, 404);
  });
  await test('reversible-hidden-data-counts-mute-owner-permissions', async () => {
    await req(`/api/community/admin/posts/${post.id}`, { ...json({ hidden: true, reason: 'fixture hide' }, b.api_key), method: 'PATCH' }, 401);
    await req(`/api/community/admin/comments/${comment.id}`, { ...json({ hidden: true, reason: 'fixture hide' }, null, { 'x-admin-api-key': admin }), method: 'PATCH' });
    assert((await req('/api/community/feed')).find(p => p.id === post.id).comment_count === 9, 'hidden comment count');
    await req(`/api/community/admin/posts/${post.id}`, { ...json({ hidden: true, reason: 'fixture hide' }, null, { 'x-admin-api-key': admin }), method: 'PATCH' });
    assert(!(await req('/api/community/feed')).some(p => p.id === post.id), 'hidden feed leak');
    assert((await req(`/api/community/comments?post_id=${post.id}`)).length === 0, 'hidden post comments leak');
    assert(await db.prepare('SELECT id FROM posts WHERE id=?').bind(post.id).first(), 'post physically removed');
    await req(`/api/community/admin/posts/${post.id}`, { ...json({ hidden: false, reason: 'fixture restore' }, null, { 'x-admin-api-key': admin }), method: 'PATCH' });
    await req(`/api/community/admin/mute/${b.id}`, json({ muted: true, reason: 'fixture mute' }, null, { 'x-admin-api-key': admin }));
    await req('/api/community/comments', json({ post_id: post.id, content: 'blocked muted write' }, b.api_key), 403);
    assert((await req('/api/community/feed')).find(p => p.id === post.id).comment_count === 0, 'muted comment count');
    await req(`/api/community/admin/mute/${b.id}`, json({ muted: false, reason: 'fixture restore' }, null, { 'x-admin-api-key': admin }));
    await req('/api/community/post?id=' + post.id, { method: 'DELETE', headers: { 'x-api-key': b.api_key } }, 403);
  });
  await test('key-rotation-CAS-and-old-key-revocation', async () => {
    const r = await req('/api/community/key', json({}, key));
    await req('/api/community/feed', { headers: { 'x-api-key': key } }, 401); key = r.api_key;
    const rs = await Promise.all([fetch(base + '/api/community/key', json({}, key)), fetch(base + '/api/community/key', json({}, key))]);
    assert(rs.filter(r => r.status === 200).length === 1 && rs.every(r => [200, 401, 409].includes(r.status)), 'rotation race');
  });
  await test('private-contact-failure-recovery-honeypot-and-retired', async () => {
    const contact = await req('/api/contact', json({ name: 'Fixture', email: 'fixture@example.org', topic: 'meetup', message: 'Private fixture inquiry' }, null, { 'idempotency-key': 'inquiry-1', 'cf-connecting-ip': '192.0.2.10' }), 202);
    assert(contact.notification_status === 'failed', 'false delivery success');
    const stored = await db.prepare('SELECT notification_status FROM contact_messages WHERE id=?').bind(contact.id).first(); assert(stored.notification_status === 'failed', 'failure not durable');
    globalThis.__ABC_D1_E2E_NOTIFY_FAIL = false;
    await req(`/api/admin/contact/${contact.id}/retry`, json({}, null, { 'x-admin-api-key': admin }));
    assert((await db.prepare('SELECT notification_status FROM contact_messages WHERE id=?').bind(contact.id).first()).notification_status === 'accepted', 'notification recovery');
    await req('/api/contact', {}, 404);
    const before = await db.prepare('SELECT COUNT(*) n FROM contact_messages').first();
    await req('/api/contact', json({ name: 'Fixture', email: 'fixture@example.org', message: 'Spam fixture', website: 'spam' }), 200);
    assert((await db.prepare('SELECT COUNT(*) n FROM contact_messages').first()).n === before.n, 'honeypot persisted');
    for (const path of ['/api/community/personal-posts', '/api/rsvp', '/api/subscribe', '/api/skills/execute']) await req(path, json({}), 410);
    assert((await db.prepare('PRAGMA foreign_key_check').all()).results.length === 0, 'FK drift');
  });
  }
} catch (e) {
  if (!records.some(r => r.verdict === 'FAIL')) records.push({ name: 'harness-prerequisite', verdict: 'BLOCKED', reason: e.message });
  process.exitCode = 1;
} finally {
  if (server) await new Promise(yes => server.close(yes));
  if (mf) await mf.dispose();
  const report = { label, boundary: 'real loopback HTTP / production route modules / local workerd D1; SDK-context and notification-only fixture', verdict: process.exitCode ? (records.some(r => r.verdict === 'FAIL') ? 'RED' : 'BLOCKED') : 'GREEN', cases: records };
  writeFileSync(resolve(artifact, 'results.json'), JSON.stringify(report, null, 2));
  const sanitized = resolve(root, 'artifacts', 'd1-backend', label);
  mkdirSync(sanitized, { recursive: true });
  writeFileSync(resolve(sanitized, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2)); console.log('Artifact:', resolve(artifact, 'results.json'));
}
