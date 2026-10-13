// Local ingress restores only Host; redirect/cache logic remains exact packaged Worker.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const out = path.resolve(process.env.ABC_CANONICAL_OUTPUT || path.join(root, 'artifacts/canonical-cache'));
const bundled = path.resolve(process.env.ABC_PACKAGED_WORKER || path.join(root, 'artifacts/worker-bundle/worker.js'));
fs.mkdirSync(out, { recursive: true });
const deps = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = deps('miniflare');
const source = JSON.parse(fs.readFileSync(path.join(root, 'wrangler.jsonc')));
const shim = `import worker from ${JSON.stringify(bundled)};export default {fetch(req,env,ctx){const h=new Headers(req.headers);h.set('host',new URL(req.url).host);return worker.fetch(new Request(req,{headers:h}),env,ctx)}}`;
const shimPath = path.join(out, 'host-ingress.js');
fs.writeFileSync(shimPath, shim);
const options = convertV4MiniflareOptions({ name: 'abc-host-owned', modulesRoot: '/', modules: [{ type: 'ESModule', path: shimPath, contents: shim }, { type: 'ESModule', path: bundled, contents: fs.readFileSync(bundled, 'utf8') }], compatibilityDate: source.compatibility_date, compatibilityFlags: ['nodejs_compat'], bindings: { NEXT_PUBLIC_BASE_URL: 'https://www.agentbuildersclub.dev' }, assets: { directory: path.join(root, '.open-next/assets'), binding: source.assets.binding, runWorkerFirst: source.assets.run_worker_first } });
options.workers[0].config.assets.hasUserWorker = true;
const m = new Miniflare(options);
const report = { boundary: 'packaged Worker; explicitly Host-restoring local ingress only', cases: [] };
(async () => {
  try {
    for (const [host, dest, status] of [['clawplex.dev', 'https://agentbuildersclub.dev', 308], ['www.clawplex.dev', 'https://agentbuildersclub.dev', 308], ['agentbuildersclub.dev', 'https://www.agentbuildersclub.dev', 308], ['www.agentbuildersclub.dev', null, 200]]) {
      for (const [headers, method] of [[{}, 'GET'], [{ RSC: '1', 'next-router-prefetch': '1' }, 'GET'], [{}, 'HEAD']]) {
        const r = await m.dispatchFetch('https://' + host + '/terms?x=a%2Fb&x=two', { redirect: 'manual', headers, method });
        const body = await r.text(); const location = r.headers.get('location');
        report.cases.push({ host, headers, method, status: r.status, location, bytes: body.length });
        assert.equal(r.status, status); if (dest) assert.equal(location, dest + '/terms?x=a%2Fb&x=two');
        if (method === 'HEAD') assert.equal(body, '');
      }
    }
    report.verdict = 'GREEN';
  } catch (e) { report.verdict = 'RED'; report.reason = e.stack; process.exitCode = 1; }
  finally { await m.dispose(); report.disposed = true; fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); }
})();
