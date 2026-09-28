// Disposable PostgreSQL 17 + PostgREST 14.1 + built Next HTTP journey.
// Failure modes: inherited live credentials/env files; wrong database/role/JWT;
// failed migrations or grants; stale schema cache/embedding/RPC; auth bypass;
// leaked credentials; orphaned container/process/database. Fail closed on each.
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifact = resolve(root, 'artifacts/api-db-e2e');
const image = 'postgrest/postgrest:v14.1@sha256:e9490aa503a5fb07d8e8c80da46e5c0c193894e583b59ed9077e74c4101ffae2';
const failures = [];
const cases = [];
let db, role, container, next, gateway;
let sharedRolesCreated = false;
const migrationList = [];
const pg = { PGHOST: '127.0.0.1', PGPORT: '5432', PGUSER: 'postgres', PGDATABASE: 'postgres', PGPASSWORD: 'test-only-password' };
const restPort = 33281, nextPort = 33282;
const restUrl = `http://127.0.0.1:${restPort}`;
const gatewayUrl = 'http://127.0.0.1:33280';
const appUrl = `http://127.0.0.1:${nextPort}`;
function check(condition, message) { if (!condition) throw Error(message); }
function command(bin, args, env = pg, showSafeFailure = false) {
  const r = spawnSync(bin, args, { cwd: root, env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env }, encoding: 'utf8', timeout: 300000 });
  if (r.error || r.status !== 0) {
    // Only the credential-free Next build may print diagnostics. SQL/Docker output
    // can contain generated JWTs or passwords and must remain withheld.
    if (showSafeFailure) console.error((r.stdout + r.stderr).slice(-6000));
    throw Error(`${bin} failed (${r.status ?? r.error?.code}); ${showSafeFailure ? 'credential-free build diagnostics above' : 'output withheld (may contain credentials)'}`);
  }
  return r.stdout.trim();
}
function sql(query, database = 'postgres') {
  return command('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-d', database, '-c', query]);
}
async function request(base, path, options = {}) {
  const r = await fetch(base + path, { ...options, signal: AbortSignal.timeout(10000) });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: r.status, body };
}
function json(method, payload, key, headers = {}) {
  return { method, headers: { 'content-type': 'application/json', ...(key ? { 'x-api-key': key } : {}), ...headers }, body: JSON.stringify(payload) };
}
async function caseRun(id, fn) {
  try { await fn(); cases.push({ id, status: 'passed' }); }
  catch (e) { cases.push({ id, status: 'failed', reason: e.message }); throw e; }
}
async function expect(base, path, options, status) {
  const r = await request(base, path, options);
  check(r.status === status, `${path}: expected HTTP ${status}, got ${r.status}`);
  check(r.body !== null, `${path}: expected JSON`);
  return r.body;
}
async function ready(url, predicate) {
  for (let i = 0; i < 40; i++) {
    try { const r = await request(url, '/'); if (predicate(r)) return; } catch { /* startup */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw Error(`local service did not become ready: ${url}`);
}
function jwt(secret) {
  const b64 = v => Buffer.from(JSON.stringify(v)).toString('base64url');
  const input = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role: 'service_role', exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${input}.${createHmac('sha256', secret).update(input).digest('base64url')}`;
}
async function journey(serviceKey) {
  const bearer = { Authorization: `Bearer ${serviceKey}` };
  await caseRun('postgrest-role-and-anon-grants', async () => {
    for (const [path, options] of [
      ['/agents?select=id', {}],
      ['/posts', json('POST', { id: 'forbidden', agent_id: 'forbidden', content: 'forbidden' })],
      ['/rpc/consume_rate_limit', json('POST', { p_key: 'forbidden', p_action: 'test', p_window_seconds: 60, p_max_count: 1 })],
    ]) {
      const r = await request(restUrl, path, options);
      check(r.status === 401 || r.status === 403, `anonymous direct ${path} unexpectedly returned ${r.status}`);
    }
    const probe = await request(restUrl, '/agents?select=id&limit=1', { headers: bearer });
    check(probe.status === 200 && Array.isArray(probe.body), `service_role JWT query failed (${probe.status})`);
    const rpc = await request(restUrl, '/rpc/consume_rate_limit', json('POST', { p_key: createHash('sha256').update(randomBytes(16)).digest('hex'), p_action: 'probe', p_window_seconds: 60, p_max_count: 1 }, null, bearer));
    check(rpc.status === 200 && rpc.body?.allowed === true, `service_role RPC failed (${rpc.status})`);
  });
  let id, oldKey, newKey, postId;
  const name = `e2e-${randomBytes(6).toString('hex')}`;
  const ip = `192.0.2.${Math.floor(Math.random() * 250) + 1}`;
  await caseRun('register-and-persisted-key-digest', async () => {
    const r = await expect(appUrl, '/api/community/register', json('POST', { name, website: 'https://example.org', skills: ['testing'] }, null, { 'x-forwarded-for': ip }), 201);
    check(typeof r.id === 'string' && typeof r.api_key === 'string' && r.name === name, 'registration envelope');
    id = r.id; oldKey = r.api_key;
    const rows = await expect(restUrl, `/agents?select=id,api_key,api_key_hash&id=eq.${encodeURIComponent(id)}`, { headers: bearer }, 200);
    // This is an assertion for a random high-entropy API token, not password storage.
    //codeql[js/insufficient-password-hash]
    const digest = createHash('sha256').update(oldKey).digest('hex');
    check(rows.length === 1 && rows[0].api_key === digest && rows[0].api_key_hash === digest && digest !== oldKey, 'persisted key digest mismatch');
    const directory = await expect(appUrl, '/api/community/agents', {}, 200);
    check(!JSON.stringify(directory).includes(oldKey) && !JSON.stringify(directory).includes(digest), 'directory exposes credentials');
  });
  await caseRun('registration-rate-limit', async () => {
    const r = await expect(appUrl, '/api/community/register', json('POST', { name: `${name}-other`, website: 'https://example.org' }, null, { 'x-forwarded-for': ip }), 429);
    check(typeof r.error === 'string', 'rate limit error envelope');
  });
  await caseRun('missing-and-invalid-credentials', async () => {
    for (const key of [undefined, 'invalid-local-key']) {
      const r = await expect(appUrl, '/api/community/post', json('POST', { content: 'blocked' }, key), 401);
      check(typeof r.error === 'string', 'unauthorized error envelope');
    }
  });
  await caseRun('post-feed-and-uniqueness', async () => {
    const p = await expect(appUrl, '/api/community/post', json('POST', { content: 'real database journey' }, oldKey), 201);
    check(typeof p.id === 'string' && p.content === 'real database journey' && p.agent_name === name, 'post envelope');
    postId = p.id;
    const rows = await expect(appUrl, '/api/community/feed', {}, 200);
    check(Array.isArray(rows) && rows.some(row => row.id === postId && row.agent_name === name && row.content === p.content && row.user_upvoted === false), 'anonymous feed projection missing post');
    check(!JSON.stringify(rows).includes(oldKey), 'feed exposes key');
    // Different IP isolates the uniqueness check from the registration rate bucket.
    const conflict = await expect(appUrl, '/api/community/register', json('POST', { name: name.toUpperCase(), website: 'https://example.org' }, null, { 'x-forwarded-for': '198.51.100.88' }), 409);
    check(typeof conflict.error === 'string', 'uniqueness error envelope');
  });
  await caseRun('comment-upvote-and-feed-counts', async () => {
    const comment = await expect(appUrl, '/api/community/comments', json('POST', { post_id: postId, content: 'verified comment' }, oldKey), 201);
    check(comment.post_id === postId && comment.agent?.name === name && comment.content === 'verified comment', 'comment envelope');
    const comments = await expect(appUrl, `/api/community/comments?post_id=${postId}`, {}, 200);
    check(Array.isArray(comments) && comments.some(c => c.id === comment.id && c.agent?.name === name), 'comment embedding');
    const vote = await expect(appUrl, `/api/community/upvote/${postId}`, json('POST', {}, oldKey), 200);
    check(vote.upvoted === true && vote.count === 1, 'vote RPC result');
    const feed = await expect(appUrl, '/api/community/feed', { headers: { 'x-api-key': oldKey } }, 200);
    check(feed.some(p => p.id === postId && p.upvote_count === 1 && p.comment_count === 1 && p.user_upvoted === true && p.agent_post_count >= 1), 'feed counts/voter projection');
  });
  await caseRun('rotation-revokes-old-key', async () => {
    const rotated = await expect(appUrl, '/api/community/key', json('POST', {}, oldKey), 200);
    newKey = rotated.api_key;
    check(rotated.id === id && typeof newKey === 'string' && newKey !== oldKey, 'rotation envelope');
    for (const [path, options] of [
      ['/api/community/post', json('POST', { content: 'blocked' }, oldKey)],
      ['/api/community/comments', json('POST', { post_id: postId, content: 'blocked' }, oldKey)],
      [`/api/community/upvote/${postId}`, json('POST', {}, oldKey)],
      ['/api/community/key', json('POST', {}, oldKey)],
    ]) {
      const r = await expect(appUrl, path, options, 401);
      check(typeof r.error === 'string', `old key error envelope ${path}`);
    }
    const persisted = await expect(restUrl, `/agents?select=api_key,api_key_hash&id=eq.${encodeURIComponent(id)}`, { headers: bearer }, 200);
    // This is an assertion for a random high-entropy API token, not password storage.
    //codeql[js/insufficient-password-hash]
    const digest = createHash('sha256').update(newKey).digest('hex');
    check(persisted.length === 1 && persisted[0].api_key === digest && persisted[0].api_key_hash === digest, 'rotated digest not persisted');
    const p = await expect(appUrl, '/api/community/post', json('POST', { content: 'new key works' }, newKey), 201);
    check(p.content === 'new key works', 'new key post');
  });
}
async function main() {
  mkdirSync(artifact, { recursive: true });
  const envFiles = readdirSync(root).filter(f => /^\.env(?:\.|$)/.test(f) && f !== '.env.example');
  const inherited = Object.keys(process.env).filter(k => /^(?:SUPABASE|NEXT_PUBLIC_SUPABASE|DATABASE_URL|CLAWPLEX_ADMIN_)/i.test(k));
  check(!envFiles.length && !inherited.length, `refusing inherited credentials/env files (${[...envFiles, ...inherited].join(', ')})`);
  check(process.env.PGHOST === pg.PGHOST && process.env.PGPORT === pg.PGPORT && process.env.PGUSER === pg.PGUSER && process.env.PGDATABASE === pg.PGDATABASE && process.env.PGPASSWORD === pg.PGPASSWORD, 'CI-only synthetic PostgreSQL identity required');
  check(sql('SELECT version()').includes('PostgreSQL 17.'), 'PostgreSQL 17 required');
  const suffix = randomBytes(8).toString('hex');
  db = `abc_e2e_${suffix}`; role = `abc_auth_${suffix}`; container = `abc-pgrst-${suffix}`;
  const rolePassword = randomBytes(32).toString('hex');
  const secret = randomBytes(48).toString('hex');
  const key = jwt(secret);
  sql(`CREATE ROLE ${role} LOGIN NOINHERIT PASSWORD '${rolePassword}'; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; GRANT anon, service_role TO ${role};`);
  sharedRolesCreated = true;
  sql(`CREATE DATABASE ${db}`);
  sql('GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role', db);
  const migrations = readdirSync(resolve(root, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort();
  check(migrations.length === 15 && migrations[0].startsWith('001_') && migrations.at(-1).startsWith('20260904230939_'), 'unexpected migration set/order');
  for (const file of migrations) {
    command('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-d', db, '-f', resolve(root, 'supabase/migrations', file)]);
    migrationList.push(file);
  }
  command('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-d', db, '-f', resolve(root, 'scripts/test-database.sql')]);
  const uri = `postgres://${role}:${rolePassword}@127.0.0.1:5432/${db}`;
  // Linux GitHub runner: host networking reaches the loopback-bound PG service.
  command('docker', ['run', '-d', '--name', container, '--network', 'host', '-e', 'PGRST_DB_URI', '-e', 'PGRST_DB_SCHEMAS=public', '-e', 'PGRST_DB_ANON_ROLE=anon', '-e', 'PGRST_JWT_SECRET', '-e', 'PGRST_DB_CONFIG=false', '-e', 'PGRST_SERVER_HOST=127.0.0.1', '-e', `PGRST_SERVER_PORT=${restPort}`, image], { PGRST_DB_URI: uri, PGRST_JWT_SECRET: secret });
  await ready(restUrl, r => r.status === 200);
  // supabase-js addresses /rest/v1/*; standalone PostgREST serves at /*.
  // This transport-only adapter neither fabricates data nor bypasses role checks.
  gateway = createServer(async (req, res) => {
    if (!req.url?.startsWith('/rest/v1/')) { res.writeHead(404).end(); return; }
    try {
      const incoming = new URL(req.url, gatewayUrl);
      if (incoming.origin !== gatewayUrl || !incoming.pathname.startsWith('/rest/v1/')) {
        res.writeHead(400).end(); return;
      }
      // Preserve only the path/query, never a caller-selected origin or redirect.
      const target = new URL(restUrl);
      target.pathname = incoming.pathname.slice('/rest/v1'.length);
      target.search = incoming.search;
      const upstream = await fetch(target, {
        redirect: 'error',
        method: req.method, headers: { ...req.headers, host: `127.0.0.1:${restPort}`, 'accept-encoding': 'identity', connection: 'close' },
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
        duplex: 'half',
      });
      const headers = Object.fromEntries(upstream.headers);
      delete headers['transfer-encoding'];
      delete headers.connection;
      res.writeHead(upstream.status, headers);
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch { res.writeHead(502).end(); }
  });
  await new Promise((accept, reject) => { gateway.once('error', reject); gateway.listen(33280, '127.0.0.1', accept); });
  const buildEnv = { PATH: process.env.PATH, HOME: process.env.HOME, NEXT_TELEMETRY_DISABLED: '1', CI: 'true' };
  command(resolve(root, 'node_modules/.bin/next'), ['build'], buildEnv, true);
  next = spawn(resolve(root, 'node_modules/.bin/next'), ['start', '-H', '127.0.0.1', '-p', String(nextPort)], {
    cwd: root, env: { ...buildEnv, SUPABASE_URL: gatewayUrl, SUPABASE_SERVICE_ROLE_KEY: key, PORT: String(nextPort) }, stdio: 'ignore',
  });
  await ready(appUrl, r => r.status > 0);
  await journey(key);
}
try { await main(); }
catch (e) { failures.push(e.message); console.error(`API+DB E2E failed: ${e.message}`); }
finally {
  if (next) { next.kill('SIGTERM'); await new Promise(r => { next.once('exit', r); setTimeout(r, 3000); }); if (next.exitCode === null) next.kill('SIGKILL'); }
  if (gateway) await new Promise(r => gateway.close(r));
  if (container) { try { command('docker', ['rm', '-f', container], {}); } catch { failures.push('PostgREST teardown failed'); } }
  if (db) { try { sql(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`); check(sql(`SELECT count(*) FROM pg_database WHERE datname='${db}'`) === '0', 'database teardown not verified'); } catch { failures.push('database teardown failed'); } }
  if (role) { try { sql(`DROP ROLE IF EXISTS ${role}`); check(sql(`SELECT count(*) FROM pg_roles WHERE rolname='${role}'`) === '0', 'role teardown not verified'); } catch { failures.push('role teardown failed'); } }
  if (sharedRolesCreated) {
    try {
      sql('DROP ROLE IF EXISTS anon, authenticated, service_role');
      check(sql("SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')") === '0', 'shared role teardown not verified');
    } catch { failures.push('shared role teardown failed'); }
  }
  const result = failures.length === 0 && cases.length === 7 && cases.every(c => c.status === 'passed') ? 'passed' : 'failed';
  mkdirSync(artifact, { recursive: true });
  writeFileSync(resolve(artifact, 'manifest.json'), JSON.stringify({ schema: 1, commit: command('git', ['rev-parse', 'HEAD'], {}), result, stack: { postgres: '17', postgrest: image, app: 'next build + next start over loopback' }, migrations: migrationList, cases, failures }, null, 2) + '\n');
  console.log(`API+DB E2E ${result}; ${cases.length} cases; sanitized artifact: artifacts/api-db-e2e/manifest.json`);
  if (result !== 'passed') process.exitCode = 1;
}
