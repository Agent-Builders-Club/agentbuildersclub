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
const artifact = resolve(scratch, 'abc-policy-e2e', label);
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
  let before, oldColumns;
  async function snapshot(){const names=[...readFileSync(resolve(migrations,'0001_retained_application.sql'),'utf8').matchAll(/CREATE TABLE (\w+)/g)].map(m=>m[1]).sort();const rows={};for(const name of names){const columns=oldColumns?.[name]??(await db.prepare(`PRAGMA table_info(${name})`).all()).results.map(c=>c.name);rows[name]=(await db.prepare(`SELECT ${columns.join(',')} FROM ${name} ORDER BY id`.replace('ORDER BY id',name==='rate_limit_buckets'?'ORDER BY key_hash,action':'ORDER BY id')).all()).results;}return rows;}
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
      if(f==='0001_retained_application.sql'){
        const d=createHash('sha256').update('synthetic-preserved-digest').digest('hex');
        await db.prepare('INSERT INTO agents(id,name,api_key,api_key_hash) VALUES(?,?,?,?)').bind('preserved','Preserved',d,d).run();
        await db.prepare('INSERT INTO posts(id,agent_id,content) VALUES(?,?,?)').bind('preserved-post','preserved','Synthetic historical post').run();
        await db.prepare('INSERT INTO comments(id,post_id,agent_id,content) VALUES(?,?,?,?)').bind('preserved-comment','preserved-post','preserved','Synthetic legacy comment').run();
        await db.prepare('INSERT INTO contact_messages(id,name,email,topic,message,request_key,request_hash,notification_status) VALUES(?,?,?,?,?,?,?,?)').bind('preserved-inquiry','Synthetic Only','synthetic@example.org','Fixture','Synthetic private inquiry, unchanged','historical-key','historical-hash','accepted').run();
        oldColumns={};for(const r of [...readFileSync(resolve(migrations,f),'utf8').matchAll(/CREATE TABLE (\w+)/g)].map(m=>({name:m[1]})))oldColumns[r.name]=(await db.prepare(`PRAGMA table_info(${r.name})`).all()).results.map(c=>c.name);
        before=await snapshot();
      }

    }
  }
  catch (e) { if (e.code !== 'ENOENT') { records.push({ name: 'migrations', verdict: 'FAIL', reason: e.message }); } }
  const after=await snapshot();
  writeFileSync(resolve(artifact,'migration-preservation.json'),JSON.stringify({before,after,oldColumns,unchanged:JSON.stringify(before)===JSON.stringify(after)},null,2));
  await test('migration-preserves-every-old-cell-and-adds-forward-schema',async()=>{assert(JSON.stringify(before)===JSON.stringify(after),'Historical cells changed');assert((await db.prepare('PRAGMA table_info(contact_messages)').all()).results.some(c=>c.name==='implicit_fingerprint'),'Forward migration missing');});
  globalThis.__ABC_D1_E2E_CONTEXT = { env: { DB: db, CLAWPLEX_ADMIN_API_KEY: admin } };
  globalThis.__ABC_D1_E2E_NOTIFY_FAIL = false; globalThis.__ABC_POLICY_NOTIFICATIONS = 0;
  const files = routeFiles(resolve(root, 'src/app/api'));
  const entry = files.map((f, i) => `import * as r${i} from ${JSON.stringify(f)};`).join('\n') + '\nexport const routes = [' + files.map((f, i) => `{path:${JSON.stringify('/' + f.slice(resolve(root, 'src/app').length + 1).replace(/\/route.ts$/, ''))},module:r${i}}`).join(',') + '];';
  await build({ stdin: { contents: entry, resolveDir: root, sourcefile: 'd1-http-fixture.ts', loader: 'ts' }, outfile: resolve(artifact, 'routes.cjs'), platform: 'node', format: 'cjs', bundle: true, packages: 'external', tsconfig: resolve(root, 'tsconfig.json'), plugins: [{ name: 'sdk-context-only', setup(b) {
    b.onResolve({ filter: /^@opennextjs\/cloudflare$/ }, () => ({ path: 'context', namespace: 'fixture' }));
    b.onResolve({ filter: /contact-delivery$/ }, () => ({ path: 'notify', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'context' ? 'export async function getCloudflareContext(){return globalThis.__ABC_D1_E2E_CONTEXT}' : 'export async function notifyContact(){globalThis.__ABC_POLICY_NOTIFICATIONS++;if(globalThis.__ABC_D1_E2E_NOTIFY_FAIL)throw Error("fixture notification rejection");return {status:"accepted",messageId:"fixture-receipt"}}', loader: 'js' }));
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
  await new Promise((yes, no) => { server.once('error', no); server.listen(33286, '127.0.0.1', yes); });
  base = 'http://127.0.0.1:33286';


  const hash=v=>createHash('sha256').update(v).digest('hex');
  async function actor(id){const key=randomBytes(32).toString('hex'),d=hash(key);await db.prepare('INSERT INTO agents(id,name,api_key,api_key_hash) VALUES(?,?,?,?)').bind(id,id,d,d).run();return key;}
  const owner=await actor('owner');
  for(const id of ['one','two','hidden'])await db.prepare('INSERT INTO posts(id,agent_id,content,hidden) VALUES(?,?,?,?)').bind(id,'owner',id,id==='hidden'?1:0).run();
  const comment=(key,content,post_id='one',headers={})=>req('/api/community/comments',json({post_id,content},key,headers),201);
  async function history(id,author,content,age,post='one',normalized=null,hidden=0){await db.prepare('INSERT INTO comments(id,agent_id,post_id,content,normalized_content,created_at,hidden) VALUES(?,?,?,?,?,?,?)').bind(id,author,post,content,normalized,new Date(Date.now()-age).toISOString(),hidden).run();}
  const day=86400000,window=1800000;
  await test('comment-normalized-same-post-recent-409',async()=>{const k=await actor('recent');await comment(k,'ＡLPHA  beta');await req('/api/community/comments',json({post_id:'one',content:'alpha\u200B BETA'.replace('\\u200B','\u200B')},k),409);});
  await test('comment-same-content-other-post-allowed',async()=>{const k=await actor('other-post');await comment(k,'Reusable reply');await comment(k,' reusable REPLY ','two');});
  for(const [name,age] of [['exact-24h',day],['older-24h',day+60000]])await test('comment-'+name+'-allowed',async()=>{const k=await actor(name);await history(name+'-old',name,'Window reply',age,'one','window reply');await comment(k,'Window reply');});
  await test('comment-other-author-allowed',async()=>{const a=await actor('author-a'),b=await actor('author-b');await comment(a,'Shared reply');await comment(b,'Shared reply');});
  await test('comment-hidden-recent-history-still-blocks',async()=>{const k=await actor('hidden-history');await history('hidden-history-old','hidden-history','Hidden reply',1000,'one','hidden reply',1);await req('/api/community/comments',json({post_id:'one',content:'Hidden reply'},k),409);});
  for(const [name,age,post,status] of [['recent',1000,'one',409],['other-post',1000,'two',201],['old',day+60000,'one',201]])await test('comment-legacy-null-'+name,async()=>{const id='legacy-'+name,k=await actor(id);await history(id+'-old',id,'Ｌegacy\u200B  REPLY'.replace('\\u200B','\u200B'),age,post);await req('/api/community/comments',json({post_id:'one',content:'legacy reply'},k),status);});
  await test('comment-legacy-no-2000-row-truncation',async()=>{const k=await actor('legacy-many');await history('legacy-many-dup','legacy-many','Oldest recent repeat',60000);const statements=[];for(let i=0;i<2001;i++)statements.push(db.prepare('INSERT INTO comments(id,agent_id,post_id,content,created_at) VALUES(?,?,?,?,?)').bind('many-'+i,'legacy-many','one','Distinct '+i,new Date(Date.now()-1000).toISOString()));await db.batch(statements);await req('/api/community/comments',json({post_id:'one',content:'Oldest recent repeat'},k),409);});
  await test('comment-concurrent-duplicates-atomic',async()=>{const k=await actor('race');const responses=await Promise.all(Array.from({length:5},()=>fetch(base+'/api/community/comments',json({post_id:'one',content:'Atomic repeat'},k))));assert(responses.filter(r=>r.status===201).length===1&&responses.filter(r=>r.status===409).length===4,'Duplicate race status');assert((await db.prepare('SELECT count(*) n FROM comments WHERE agent_id=?').bind('race').first()).n===1,'Duplicate durable rows');});
  await test('comment-explicit-replay-conflict-durable',async()=>{const k=await actor('explicit');const headers={'idempotency-key':'comment-explicit'};const a=await comment(k,'Explicit reply','one',headers);await db.prepare('UPDATE comments SET created_at=? WHERE id=?').bind(new Date(Date.now()-day*2).toISOString(),a.id).run();const b=await req('/api/community/comments',json({post_id:'one',content:'Explicit reply'},k,headers));assert(a.id===b.id,'Replay ID changed');await req('/api/community/comments',json({post_id:'two',content:'Explicit reply'},k,headers),409);});
  await test('comment-auth-mute-target-and-orphan-rules',async()=>{const k=await actor('guards');for(const key of [null,'invalid'])await req('/api/community/comments',json({post_id:'one',content:'Guard reply'},key),401);for(const post of ['hidden','absent'])await req('/api/community/comments',json({post_id:post,content:'Guard reply'},k),404);await db.prepare('UPDATE agents SET muted=1 WHERE id=?').bind('owner').run();await req('/api/community/comments',json({post_id:'one',content:'Guard reply'},k),404);await db.prepare('UPDATE agents SET muted=0 WHERE id=?').bind('owner').run();await db.prepare('UPDATE agents SET muted=1 WHERE id=?').bind('guards').run();await req('/api/community/comments',json({post_id:'one',content:'Guard reply'},k),403);const publicRows=await req('/api/community/comments?post_id=absent');assert(publicRows.length===0,'Orphan visibility');});
  await test('comment-hidden-quota-and-concurrent-distinct-quota',async()=>{const k=await actor('quota');for(let i=0;i<9;i++)await history('quota-'+i,'quota','Quota '+i,1000,'one',null,1);const replies=await Promise.all(Array.from({length:5},(_,i)=>fetch(base+'/api/community/comments',json({post_id:'one',content:'Distinct new '+i},k))));assert(replies.filter(r=>r.status===201).length===1&&replies.filter(r=>r.status===429).length===4,'Quota race');});
  await test('post-global-duplicate-policy-unchanged',async()=>{const k=await actor('post-global');await req('/api/community/post',json({content:'Permanent post'},k),201);await db.prepare('UPDATE posts SET created_at=? WHERE agent_id=?').bind('2000-01-01T00:00:00.000Z','post-global').run();await req('/api/community/post',json({content:' permanent POST '},k),409);});
  await test('native-comment-exact-window-and-old-worker-insert-compatible',async()=>{const k=await actor('native');void k;const insert=(id,at)=>db.prepare('INSERT INTO comments(id,agent_id,post_id,content,normalized_content,created_at,write_limit) VALUES(?,?,?,?,?,?,?)').bind(id,'native','one','Native repeat','native repeat',at,10).run();const at='2020-01-02T00:00:00.000Z';await insert('native-old','2020-01-01T00:00:00.000Z');await insert('native-boundary',at);let rejected=false;try{await insert('native-inside','2020-01-02T23:59:59.999Z');}catch(e){rejected=String(e).includes('DUPLICATE_CONTENT');}assert(rejected,'Native rolling predicate not atomic');});
  const inquiry={name:'Synthetic Policy',email:'synthetic-policy@example.org',topic:'Synthetic only',message:'Synthetic private policy fixture'};
  const contact=(ip,payload=inquiry,headers={})=>json(payload,null,{'cf-connecting-ip':ip,...headers});
  async function contactAt(ip,age,id='legacy-contact',payload=inquiry){const ph=hash(JSON.stringify([payload.name,payload.email,payload.topic,payload.message]));const key=hash(`${ip}:inquiry:${ph}`);await db.prepare('INSERT INTO contact_messages(id,name,email,topic,message,request_key,request_hash,created_at,notification_status,notification_attempts) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,payload.name,payload.email,payload.topic,payload.message,key,ph,new Date(Date.now()-age).toISOString(),'accepted',1).run();return id;}
  await test('contact-implicit-replay-single-row-single-notification',async()=>{const n=globalThis.__ABC_POLICY_NOTIFICATIONS;const a=await req('/api/contact',contact('192.0.2.101'),201),b=await req('/api/contact',contact('192.0.2.101'));assert(a.id===b.id&&globalThis.__ABC_POLICY_NOTIFICATIONS===n+1,'Replay row/notification duplicated');});
  for(const [name,age,status] of [['recent',1000,200],['bucket-crossing',29*60000,200],['exact-30m',window,201],['older',window+60000,201]])await test('contact-legacy-'+name,async()=>{const ip='192.0.2.'+({recent:102,'bucket-crossing':103,'exact-30m':104,older:105}[name]),id='contact-'+name;await contactAt(ip,age,id);const a=await req('/api/contact',contact(ip),status);assert((a.id===id)===(status===200),'Legacy rolling ID');const old=await db.prepare('SELECT * FROM contact_messages WHERE id=?').bind(id).first();assert(old.notification_attempts===1&&old.message===inquiry.message,'Legacy history rewritten');});
  await test('contact-new-implicit-expiry-not-sliding',async()=>{const ip='192.0.2.106';const a=await req('/api/contact',contact(ip),201);await db.prepare('UPDATE contact_messages SET created_at=? WHERE id=?').bind(new Date(Date.now()-29*60000).toISOString(),a.id).run();assert((await req('/api/contact',contact(ip))).id===a.id,'Premature rolling expiry');await db.prepare('UPDATE contact_messages SET created_at=? WHERE id=?').bind(new Date(Date.now()-31*60000).toISOString(),a.id).run();const b=await req('/api/contact',contact(ip),201);assert(b.id!==a.id,'Expired inquiry reused');});
  await test('contact-concurrent-implicit-atomic-row-and-notification',async()=>{const n=globalThis.__ABC_POLICY_NOTIFICATIONS;const rs=await Promise.all(Array.from({length:3},()=>fetch(base+'/api/contact',contact('192.0.2.107'))));const bodies=await Promise.all(rs.map(r=>r.json()));assert(rs.every(r=>[200,201,202].includes(r.status)),'Race HTTP failure');assert(new Set(bodies.map(r=>r.id)).size===1&&bodies.every(b=>b.saved),'Race durable IDs');assert(globalThis.__ABC_POLICY_NOTIFICATIONS===n+1,'Race transport repeated');});
  await test('contact-IP-payload-explicit-key-independence',async()=>{const a=await req('/api/contact',contact('192.0.2.108'),201),b=await req('/api/contact',contact('192.0.2.109'),201),c=await req('/api/contact',contact('192.0.2.108',{...inquiry,message:'Different payload'}),201),d=await req('/api/contact',contact('192.0.2.108',inquiry,{'idempotency-key':'separate'}),201);assert(new Set([a.id,b.id,c.id,d.id]).size===4,'Independent inquiries merged');});
  await test('contact-explicit-durable-replay-and-conflict-unchanged',async()=>{const ip='192.0.2.110',h={'idempotency-key':'durable'};const a=await req('/api/contact',contact(ip,inquiry,h),201);await db.prepare('UPDATE contact_messages SET created_at=? WHERE id=?').bind('2000-01-01T00:00:00.000Z',a.id).run();assert((await req('/api/contact',contact(ip,inquiry,h))).id===a.id,'Explicit expired');await req('/api/contact',contact(ip,{...inquiry,message:'Changed'},h),409);const b=await req('/api/contact',contact(ip,inquiry,{'idempotency-key':'other-key'}),201);const c=await req('/api/contact',contact('192.0.2.111',inquiry,h),201);assert(new Set([a.id,b.id,c.id]).size===3,'Explicit scopes changed');});
  await test('native-contact-boundary-and-old-worker-column-compatibility',async()=>{const names=(await db.prepare('PRAGMA table_info(contact_messages)').all()).results.map(c=>c.name);assert(names.includes('implicit_fingerprint'),'Missing schema');const insert=(id,key,at,fp)=>db.prepare('INSERT INTO contact_messages(id,name,email,message,request_key,created_at,implicit_fingerprint) VALUES(?,?,?,?,?,?,?)').bind(id,'Synthetic','synthetic@example.org','Synthetic',key,at,fp).run();await insert('native-contact-a','native-a','2020-01-01T00:00:00.000Z','native-fingerprint');await insert('native-contact-b','native-b','2020-01-01T00:30:00.000Z','native-fingerprint');let reject=false;try{await insert('native-contact-c','native-c','2020-01-01T00:59:59.999Z','native-fingerprint');}catch(e){reject=String(e).includes('DUPLICATE_INQUIRY');}assert(reject,'Native contact predicate');await db.prepare('INSERT INTO contact_messages(id,name,email,message,request_key) VALUES(?,?,?,?,?)').bind('old-worker','Synthetic','synthetic@example.org','Old Worker compatible','old-worker-key').run();});
} catch (e) {
  if (!records.some(r => r.verdict === 'FAIL')) records.push({ name: 'harness-prerequisite', verdict: 'BLOCKED', reason: e.message });
  process.exitCode = 1;
} finally {
  if (server) await new Promise(yes => server.close(yes));
  if (mf) await mf.dispose();
  if(records.some(r=>r.verdict==='FAIL'))process.exitCode=1;
  const report = { label, timestamp:new Date().toISOString(), runner_sha256:createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'), source_sha256:Object.fromEntries(['src/lib/application-api.ts','src/lib/community-d1.ts','src/lib/rate-limit.ts',...readdirSync(resolve(root,'d1/migrations')).filter(f=>f.endsWith('.sql')).map(f=>'d1/migrations/'+f)].map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')])), selection:'all approved duplicate-policy contracts, no skips', boundary: 'real loopback HTTP / production route modules / local workerd D1; SDK-context and notification-only fixture', verdict: process.exitCode ? (records.some(r => r.verdict === 'FAIL') ? 'RED' : 'BLOCKED') : 'GREEN', cases: records };
  writeFileSync(resolve(artifact, 'results.json'), JSON.stringify(report, null, 2));
  const sanitized = resolve(process.env.ABC_POLICY_EVIDENCE || resolve(root, 'artifacts/duplicate-policy'), label);
  mkdirSync(sanitized, { recursive: true });
  writeFileSync(resolve(sanitized, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2)); console.log('Artifact:', resolve(artifact, 'results.json'));
}
