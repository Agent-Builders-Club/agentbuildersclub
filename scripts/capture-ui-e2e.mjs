// Invoke through compiled-d1-e2e.mjs: it owns full-schema profile seed and cleanup.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.env.ABC_CAPTURE_OUTPUT || resolve(root, 'artifacts/ui-capture'));
assert(process.env.ABC_SERVING_MODE === 'compiled-opennext-local-d1', 'Compiled full D1 fixture required');
mkdirSync(out, { recursive: true });
const report = { verdict: 'RED', motions: [] };
for (const motion of ['reduce', 'no-preference']) {
  const target = resolve(out, motion);
  const r = spawnSync(process.execPath, [resolve(root, 'scripts/dzhng-ui-e2e.mjs')], { cwd: root, env: { ...process.env, UI_MOTION: motion, UI_EVIDENCE: target, UI_PROFILE_SERVING: '1' }, stdio: 'inherit' });
  if (r.status !== 0) { report.reason = `${motion} capture runner exit ${r.status}`; break; }
  const ui = JSON.parse(readFileSync(resolve(target, 'results.json')));
  const cases = ui.results.filter(r => r.status !== 'MEASUREMENT');
  assert.equal(cases.length, 22); assert(cases.every(r => r.status === 'PASS'));
  report.motions.push({ motion, caseCount: cases.length, result: 'PASS', output: target });
}
report.verdict = report.motions.length === 2 ? 'GREEN' : 'RED';
writeFileSync(resolve(out, 'results.json'), JSON.stringify(report, null, 2));
process.exitCode = report.verdict === 'GREEN' ? 0 : 1;
