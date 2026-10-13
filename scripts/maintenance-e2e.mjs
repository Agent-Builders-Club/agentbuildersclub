import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { localOrigin } = createRequire(import.meta.url)('./read-only-browser.cjs');
const out = resolve(process.env.ABC_MAINTENANCE_OUTPUT || resolve(root, 'artifacts/maintenance'));
mkdirSync(out, { recursive: true });
const report = { startedAt: new Date().toISOString(), verdict: 'BLOCKED', steps: [], boundary: 'serial regression + built Next browser + real HTTP/workerd D1 + read-only disposable serving runtime' };
function save() { writeFileSync(resolve(out, 'results.json'), JSON.stringify(report, null, 2)); }
save();
try {
  if (process.env.ABC_MAINTENANCE_BASE_URL) localOrigin(process.env.ABC_MAINTENANCE_BASE_URL);
  else if (!process.argv.includes('--disposable')) throw Error('Absent disposable runtime: select --disposable to build and own a local fixture; cleanup cannot be skipped');
  if (process.env.ABC_E2E_POLICY_ONLY) throw Error('Full maintenance refuses policy-only D1 selection');
  const variables = Object.keys(process.env).filter(name => /SUPABASE|DATABASE_URL|^SMTP_|^CLOUDFLARE_API|CLAWPLEX_ADMIN_(API_KEY|SECRET)/.test(name));
  const envFiles = readdirSync(root).filter(name => (/^\.env(?:\.|$)/.test(name) && name !== '.env.example') || /^\.dev\.vars(?:\.|$)/.test(name));
  if (variables.length || envFiles.length) throw Error('Maintenance refuses provider credentials/local secret files');
} catch (error) { report.reason = error.message; save(); console.error(error.message); process.exit(2); }
if (!process.env.ABC_MAINTENANCE_BASE_URL) {
  const build = spawnSync('pnpm', ['run', 'build:cloudflare'], { cwd: root, env: process.env, stdio: 'inherit' });
  if (build.status !== 0) { report.reason = 'Compiled OpenNext build prerequisite failed; no serving acceptance'; save(); process.exit(build.status || 1); }
  const fixture = spawnSync(process.execPath, [resolve(root, 'scripts/compiled-d1-e2e.mjs')], { cwd: root, env: { ...process.env, ABC_COMPILED_LABEL: 'maintenance', ABC_COMPILED_CHILD: 'scripts/maintenance-e2e.mjs' }, stdio: 'inherit' });
  // The inner run owns its complete step receipt; never replace it with a wrapper green.
  if (fixture.status !== 0) process.exit(fixture.status || 1);
  const inner = JSON.parse(readFileSync(resolve(out, 'results.json')));
  if (inner.verdict !== 'GREEN') process.exit(1);
  process.exit(0);
}
const env = { ...process.env, ABC_POLICY_EVIDENCE: resolve(out, 'duplicate-policy'), ABC_CLOSURE_OUTPUT: resolve(out, 'source-closure'), ABC_QA_URL: process.env.ABC_MAINTENANCE_BASE_URL, ABC_QA_LABEL: 'maintenance', ABC_QA_OUTPUT: resolve(out, 'cleanup'), ABC_E2E_LABEL: 'maintenance', ABC_BACKEND_EVIDENCE: resolve(out, 'backend-repair'), UI_EVIDENCE: resolve(out, 'ui-repair'), UI_ORIGIN: process.env.ABC_MAINTENANCE_BASE_URL, UI_PROFILE_SERVING: '1' };
const steps = [
  ['existing Vitest regression', 'pnpm', ['run', 'test']],
  ['runner execution safety', 'pnpm', ['run', 'test:runner']],
  ['production route HTTP/workerd D1', 'pnpm', ['run', 'test:d1-e2e']],
  ['approved duplicate-policy HTTP/native D1 contracts', 'pnpm', ['run', 'test:duplicate-policy']],
  ['backend repair contracts', process.execPath, [resolve(root, 'scripts/dzhng-backend-e2e.mjs')]],
  ['built Next browser and maintained user flows', 'pnpm', ['run', 'test:e2e']],
  ['source closure browser contracts', process.execPath, [resolve(root, 'scripts/source-closure-e2e.mjs')]],
  ['22 UI repair contracts on serving fixture', process.execPath, [resolve(root, 'scripts/dzhng-ui-e2e.mjs')]],
  ['real D1 serving read-only cleanup/profile', process.execPath, [resolve(root, 'scripts/site-cleanup-e2e.mjs')]],
];
try {
  for (const [name, binary, args] of steps) {
    const run = spawnSync(binary, args, { cwd: root, env, stdio: 'inherit' });
    report.steps.push({ name, exit: run.status, error: run.error?.message }); save();
    if (run.error || run.status !== 0) throw Error(`${name} failed`);
  }
  const d1 = JSON.parse(readFileSync(resolve(root, 'artifacts/d1-backend/maintenance/results.json')));
  const browser = JSON.parse(readFileSync(resolve(root, 'artifacts/e2e/manifest.json')));
  const cleanup = JSON.parse(readFileSync(resolve(out, 'cleanup/maintenance/results.json')));
  if (d1.verdict !== 'GREEN' || d1.selection?.fullSuite !== true || d1.caseCount !== 13 || d1.cases.some(row => row.verdict !== 'PASS')) throw Error('Missing/partial D1 evidence');
  if (browser.result !== 'passed' || browser.selection?.fullSuite !== true || !browser.caseCount || browser.cases.some(row => row.status !== 'expected')) throw Error('Missing/partial browser evidence');
  if (cleanup.passed !== true || cleanup.checks !== 21 || cleanup.results.some(row => !row.passed)) throw Error('Missing/partial cleanup evidence');
  const policy = JSON.parse(readFileSync(resolve(out, 'duplicate-policy/maintenance/results.json')));
  if (policy.verdict !== 'GREEN' || policy.cases.length !== 27 || policy.cases.some(r => r.verdict !== 'PASS')) throw Error('Missing/partial duplicate-policy evidence');
  const backend = JSON.parse(readFileSync(resolve(out, 'backend-repair/maintenance/results.json')));
  const ui = JSON.parse(readFileSync(resolve(out, 'ui-repair/results.json')));
  if (backend.verdict !== 'GREEN' || backend.cases.length !== 14 || backend.cases.some(r => r.verdict !== 'PASS')) throw Error('Missing/partial backend repair evidence');
  const uiCases = ui.results.filter(r => r.status !== 'MEASUREMENT');
  if (uiCases.length !== 22 || uiCases.some(r => r.status !== 'PASS')) throw Error('Missing/partial UI repair evidence');
  report.verdict = 'GREEN';
  report.servingMode = process.env.ABC_SERVING_MODE || 'unreceipted caller fixture';
  report.counts = { duplicatePolicy: policy.cases.length, d1Groups: d1.caseCount, backendRepair: backend.cases.length, uiRepair: uiCases.length, browserExecutions: browser.caseCount, cleanupExecutions: cleanup.checks };
} catch (error) { report.verdict = 'RED'; report.reason = error.message; process.exitCode = 1; }
report.completedAt = new Date().toISOString(); save();
