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
const artifact = resolve(scratch, 'abc-dzhng-backend-e2e', label);
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
async function test(name, fn) { try { await fn(); records.push({ name, verdict: 'PASS' }); } catch (e) { records.push({ name, verdict: 'FAIL', reason: e.message }); } }
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
  catch (e) { if (e.code !== 'ENOENT') { records.push({ name: 'migrations', verdict: 'FAIL', reason: e.message }); } }
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
  await new Promise((yes, no) => { server.once('error', no); server.listen(33285, '127.0.0.1', yes); });
  base = 'http://127.0.0.1:33285';

  const adminHeaders={'x-admin-api-key':admin};
  const key=randomBytes(32).toString('hex'),digest=createHash('sha256').update(key).digest('hex');
  await db.prepare('INSERT INTO agents(id,name,api_key,api_key_hash,skills,created_at) VALUES(?,?,?,?,?,?)').bind('actor','Actor',digest,digest,'["D1"]','2000-01-01T00:00:00.000Z').run();
  await db.prepare('INSERT INTO posts(id,agent_id,content) VALUES(?,?,?)').bind('target','actor','Public report target').run();
  async function http(path,options={}){const r=await fetch(base+path,{...options,signal:AbortSignal.timeout(15000)});return {status:r.status,headers:Object.fromEntries(r.headers),body:await r.json()};}
  const skillBody=category=>({name:'Useful skill',description:'Useful skill description',category,instructions:'Useful fixture skill instructions.',trigger_phrases:['fixture']});
  await test('five-categories-submit-approve-list-export-legacy',async()=>{
    const failures=[];
    for(const [i,category] of ['Research','Productivity','Social','Utility','Creative'].entries()){
      const s=await req('/api/skills/submit',json(skillBody(i%2?category:category.toLowerCase()),null,{'cf-connecting-ip':`192.0.2.${i+1}`}),201);
      await req('/api/skills/moderate',{...json({id:s.id,action:'approve'},null,adminHeaders),method:'PATCH'});
      const stored=await db.prepare('SELECT category FROM skills WHERE id=?').bind(s.id).first();
      if(stored.category!==category)failures.push(`stored ${stored.category} != ${category}`);
      await db.prepare('UPDATE skills SET category=? WHERE id=?').bind(category.toLowerCase(),s.id).run();
      if((await req('/api/skills')).find(r=>r.id===s.id).category!==category||(await req(`/api/skills/${s.id}/export`)).category!==category)failures.push(`legacy list/export ${category}`);
    }
    assert(!failures.length,failures.join('; '));
  });
  const peerDigest=createHash('sha256').update(randomBytes(32)).digest('hex');
  await db.prepare('INSERT INTO agents(id,name,api_key,api_key_hash) VALUES(?,?,?,?)').bind('peer','Peer',peerDigest,peerDigest).run();
  for(const [action,path,max,options,type,value] of [
    ['register','/api/community/register',1,json({name:'Retry registration',website:'https://example.org'},null,{'cf-connecting-ip':'192.0.2.50'}),'ip','192.0.2.50'],
    ['upvote','/api/community/upvote/target',20,json({},key),'agent_id','actor'],
    ['follow','/api/community/agents/peer',20,json({action:'follow'},key),'agent_id','actor'],
    ['report','/api/community/report/target',10,json({},null,{'cf-connecting-ip':'192.0.2.51'}),'ip','192.0.2.51'],
    ['skill','/api/skills/submit',3,json(skillBody('Research'),key),'agent_id','actor'],
    ['contact','/api/contact',3,json({name:'Retry',email:'retry@example.org',message:'New inquiry'},null,{'cf-connecting-ip':'192.0.2.52'}),'ip','192.0.2.52']
  ])await test(`retry-after-${action}`,async()=>{
    const reset=action==='skill'?new Date(Date.parse(new Date().toISOString().slice(0,10)+'T00:00:00Z')+86400000+120000):new Date(Date.now()+47000);
    await db.prepare('INSERT INTO rate_limit_buckets(key_hash,action,count,reset_at) VALUES(?,?,?,?)').bind(createHash('sha256').update(`${type}:${value}`).digest('hex'),action,max,reset.toISOString()).run();
    const r=await http(path,options),expected=Math.ceil((reset.getTime()-Date.now())/1000),actual=Number(r.headers['retry-after']);
    assert(r.status===429,`${action} status ${r.status}`);
    assert(Math.abs(actual-expected)<=2,`${action} Retry-After ${actual}, bucket ${expected}`);
    assert(r.body.error.includes(`retry in ${actual}s`),'message/header disagree');
  });
  await test('daily-quota-hidden-counts-utc-reset-and-rollover',async()=>{
    for(const kind of ['post','comment']){
      const table=kind==='post'?'posts':'comments',max=kind==='post'?2:10;
      for(let i=0;i<max;i++)await db.prepare(kind==='post'?'INSERT INTO posts(id,agent_id,content,hidden) VALUES(?,?,?,1)':'INSERT INTO comments(id,agent_id,post_id,content,hidden) VALUES(?,?,?,?,1)').bind(...(kind==='post'?[`quota-p-${i}`,'actor',`Historic post ${i}`]:[`quota-c-${i}`,'actor','target',`Historic comment ${i}`])).run();
      const path=kind==='post'?'/api/community/post':'/api/community/comments';
      const r=await http(path,json({content:`New ${kind}`,post_id:'target'},key));
      const expected=Math.ceil((Date.parse(new Date().toISOString().slice(0,10)+'T00:00:00Z')+86400000-Date.now())/1000);
      assert(r.status===429&&Math.abs(Number(r.headers['retry-after'])-expected)<=2,`${kind} daily clock ${r.status}`);
      await db.prepare(`UPDATE ${table} SET created_at='2000-01-01T00:00:00.000Z' WHERE agent_id=?`).bind('actor').run();
      await req(path,json({content:`New ${kind} after rollover`,post_id:'target'},key),201);
    }
  });
  await test('report-persistence-auth-queue-and-hide-context',async()=>{
    await req('/api/community/report/target',json({},null,{'cf-connecting-ip':'192.0.2.60'}),201);
    const report=await db.prepare('SELECT * FROM reports WHERE post_id=?').bind('target').first();assert(report,'report not persisted');
    await req('/api/community/admin/moderation',{},401);
    const q=await req('/api/community/admin/moderation',{headers:adminHeaders});
    assert(q.reports?.some(r=>r.id===report.id&&r.post_id==='target'&&r.content==='Public report target'),'report missing from queue');
    assert(q.posts.some(p=>p.id==='target'&&p.report_count===1),'reported public post absent from review posts');
    await db.prepare('UPDATE posts SET hidden=1 WHERE id=?').bind('target').run();
    assert((await req('/api/community/admin/moderation',{headers:adminHeaders})).reports.some(r=>r.id===report.id&&r.hidden===1),'hide lost report context');
    await db.prepare('UPDATE posts SET hidden=0 WHERE id=?').bind('target').run();
  });
  for(let i=0;i<130;i++){
    const id=`cohort-${String(i).padStart(3,'0')}`,d=createHash('sha256').update(id).digest('hex');
    await db.prepare('INSERT INTO agents(id,name,api_key,api_key_hash,skills,availability,created_at,muted) VALUES(?,?,?,?,?,?,?,?)').bind(id,id,d,d,i===0?'["D1"]':'["Irrelevant"]',i===0?'active':'offline',`2020-01-01T00:00:00.${String(i).padStart(3,'0')}Z`,i===129?1:0).run();
  }
  await test('directory-total-continuation-stable-order-public-projection',async()=>{
    const expected=(await db.prepare('SELECT id FROM agents WHERE muted=0 ORDER BY created_at DESC,id DESC').all()).results.map(r=>r.id);
    const p=await req('/api/agents?limit=100&offset=0'),q=await req('/api/agents?limit=100&offset=100');
    assert(p.total===expected.length&&q.total===expected.length,`total ${p.total} != ${expected.length}`);
    assert(p.has_more===true&&q.has_more===false,'untruthful continuation');
    assert(JSON.stringify([...p.agents,...q.agents].map(a=>a.id))===JSON.stringify(expected),'directory omissions/duplicates/order');
    const a=await http('/api/community/agents?limit=100&offset=100');
    assert(JSON.stringify(a.body.map(r=>r.id))===JSON.stringify(q.agents.map(r=>r.id)),'array ignores offset');
    assert(Number(a.headers['x-total-count'])===expected.length&&a.headers.link?.includes('rel="prev"'),'array missing total/continuation');
    assert(!JSON.stringify(p).includes('api_key'),'private projection leak');
    for(const query of ['offset=-1','limit=0','limit=101','offset=1.5','offset=abc'])await req('/api/agents?'+query,{},400);
  });
  await test('matching-older-qualified-beyond-offline-and-irrelevant-100',async()=>{
    let m=await req('/api/agents/match',json({seeking_skills:['D1']}));
    const failures=[];
    if(!m.matches.some(a=>a.agent_id==='cohort-000'))failures.push('older qualified behind >100 offline agents');
    await db.prepare("UPDATE agents SET availability='active' WHERE id LIKE 'cohort-%'").run();
    m=await req('/api/agents/match',json({seeking_skills:['D1']}));
    if(!m.matches.some(a=>a.agent_id==='cohort-000'))failures.push('older qualified behind >100 irrelevant active agents');
    assert(!failures.length,failures.join('; '));
    assert(!m.matches.some(a=>a.agent_id==='cohort-129')&&!m.community_gaps.includes('D1'),'mute/gaps mismatch');
    await db.prepare("UPDATE agents SET availability='offline' WHERE id='cohort-000'").run();
    assert(!(await req('/api/agents/match',json({seeking_skills:['D1']}))).matches.some(a=>a.agent_id==='cohort-000'),'offline matched');
  });
  await test('matching-complete-pagination-beyond-500-relevant-candidates',async()=>{
    for(let i=0;i<510;i++){
      const id=`match-${String(i).padStart(3,'0')}`,d=createHash('sha256').update(id).digest('hex');
      await db.prepare('INSERT INTO agents(id,name,api_key,api_key_hash,skills,description) VALUES(?,?,?,?,?,?)').bind(id,id,d,d,'["Quantum"]','Quantum specialist').run();
    }
    const p=await req('/api/agents/match?limit=100&offset=0',json({seeking_skills:['Quantum']}));
    const ids=[];
    for(let offset=0;offset<510;offset+=100){
      const page=await req(`/api/agents/match?limit=100&offset=${offset}`,json({seeking_skills:['Quantum']}));
      ids.push(...page.matches.map(a=>a.agent_id));
      assert(page.total===510&&page.matches.length===Math.min(100,510-offset),'matching total/page size');
      assert(page.has_more===(offset+100<510)&&page.community_gaps.length===0,'matching continuation/gaps');
    }
    assert(p.total===510&&new Set(ids).size===510,'matching omissions beyond500');
  });
  await test('report-queue-continuation-beyond100',async()=>{
    for(let i=0;i<110;i++)await db.prepare('INSERT INTO reports(id,post_id,reason) VALUES(?,?,?)').bind(`report-${i}`,'target',`Fixture reason ${i}`).run();
    const expected=(await db.prepare('SELECT count(*) n FROM reports').first()).n;
    const p=await req('/api/community/admin/moderation?offset=0&limit=100',{headers:adminHeaders});
    const q=await req('/api/community/admin/moderation?offset=100&limit=100',{headers:adminHeaders});
    assert(p.reports_total===expected&&p.reports_has_more===true&&q.reports_has_more===false,'report continuation metadata');
    assert(new Set([...p.reports,...q.reports].map(r=>r.id)).size===expected,'queue lost reports');
  });
  for(let i=0;i<130;i++)await db.prepare('INSERT INTO comments(id,post_id,agent_id,content,created_at,hidden) VALUES(?,?,?,?,?,?)').bind(`page-${String(i).padStart(3,'0')}`,'target',i===129?'cohort-129':'actor',`Page fixture ${i}`,`2021-01-01T00:00:00.${String(i).padStart(3,'0')}Z`,i===128?1:0).run();
  await test('comments-full-continuation-visible-total-order',async()=>{
    const expected=(await db.prepare('SELECT id FROM public_comments WHERE post_id=? ORDER BY created_at,id').bind('target').all()).results.map(r=>r.id);
    const p=await http('/api/community/comments?post_id=target&offset=0&limit=100'),q=await http('/api/community/comments?post_id=target&offset=100&limit=100');
    assert(JSON.stringify([...p.body,...q.body].map(c=>c.id))===JSON.stringify(expected),'later comments lost/repeated');
    assert(Number(p.headers['x-total-count'])===expected.length&&p.headers.link?.includes('offset=100')&&p.headers.link.includes('rel="next"'),'missing comment total/next');
    assert(!q.headers.link?.includes('rel="next"'),'terminal page advertises more');
    for(const query of ['offset=-1','limit=0','limit=101','offset=1.5'])await req('/api/community/comments?post_id=target&'+query,{},400);
  });
} catch (e) {
  if (!records.some(r => r.verdict === 'FAIL')) records.push({ name: 'harness-prerequisite', verdict: 'BLOCKED', reason: e.message });
  process.exitCode = 1;
} finally {
  if (server) await new Promise(yes => server.close(yes));
  if (mf) await mf.dispose();
  if(records.some(r=>r.verdict==='FAIL'))process.exitCode=1;
  const report = { label, timestamp:new Date().toISOString(), runner_sha256:createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'), source_sha256:Object.fromEntries(['src/lib/application-api.ts','src/lib/community-d1.ts','src/lib/rate-limit.ts','d1/migrations/0001_retained_application.sql'].map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')])), selection:'all backend repair contracts, no skips', boundary: 'real loopback HTTP / production route modules / local workerd D1; SDK-context and notification-only fixture', verdict: process.exitCode ? (records.some(r => r.verdict === 'FAIL') ? 'RED' : 'BLOCKED') : 'GREEN', cases: records };
  writeFileSync(resolve(artifact, 'results.json'), JSON.stringify(report, null, 2));
  const sanitized = resolve(process.env.ABC_BACKEND_EVIDENCE || resolve(root, '../evidence/backend'), label);
  mkdirSync(sanitized, { recursive: true });
  writeFileSync(resolve(sanitized, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2)); console.log('Artifact:', resolve(artifact, 'results.json'));
}
