import { readdirSync, mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'artifacts/e2e');
mkdirSync(output, { recursive: true });
const startedAt = new Date().toISOString();
for (const name of ['results.json', 'manifest.json']) {
  const target = resolve(output, name);
  if (existsSync(target)) renameSync(target, `${target}.previous-${Date.now()}`);
}
const envFiles = readdirSync(root).filter((name) => (/^\.env(?:\.|$)/.test(name) && name !== '.env.example') || /^\.dev\.vars(?:\.|$)/.test(name));
const credentialNames = Object.keys(process.env).filter((key) => /SUPABASE|DATABASE_URL|CLAWPLEX_ADMIN_(?:API_KEY|SECRET)|^SMTP_|^CLOUDFLARE_API/.test(key));
if (envFiles.length || credentialNames.length) {
  const reason = `E2E refuses local env files or provider credentials (files: ${envFiles.join(', ') || 'none'}; variable names: ${credentialNames.join(', ') || 'none'}).`;
  writeFileSync(resolve(output, 'manifest.json'), JSON.stringify({ schema: 2, startedAt, result: 'blocked', caseCount: 0, reason }, null, 2));
  console.error(reason);
  process.exit(2);
}
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
const run = (binary, args) => spawnSync(resolve(root, 'node_modules/.bin', binary), args, { cwd: root, env, stdio: 'inherit' });
const testArguments = process.argv.slice(2);
if (testArguments[0] === '--') testArguments.shift();
if (testArguments.some(argument => argument === '--list' || argument.startsWith('--pass-with-no-tests'))) {
  const reason = 'Acceptance refuses a mode that does not execute tests or permits empty discovery';
  writeFileSync(resolve(output, 'manifest.json'), JSON.stringify({ result: 'blocked', reason, caseCount: 0, startedAt }, null, 2));
  console.error(reason); process.exit(2);
}
const build = run('next', ['build']);
if (build.error || build.status !== 0) {
  writeFileSync(resolve(output, 'manifest.json'), JSON.stringify({ result: 'blocked', reason: 'build prerequisite failed', caseCount: 0, startedAt }, null, 2));
  process.exit(build.status || 1);
}
const tests = run('playwright', ['test', ...testArguments]);
const reportPath = resolve(output, 'results.json');
let cases = [];
try {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const collect = (suite) => {
    for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) {
      cases.push({ title: spec.title, project: test.projectName, status: test.status,
        artifacts: (test.results ?? []).flatMap((result) => result.attachments ?? []).filter((a) => a.path).map((a) => a.path) });
    }
    for (const child of suite.suites ?? []) collect(child);
  };
  for (const suite of report.suites ?? []) collect(suite);
} catch (error) {
  console.error(`Unable to read Playwright JSON report: ${error.message}`);
}
const manifest = {
  schema: 2,
  startedAt,
  completedAt: new Date().toISOString(),
  runnerSha256: createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
  buildId: readFileSync(resolve(root, '.next/BUILD_ID'), 'utf8').trim(),
  server: 'next build + next start (127.0.0.1:3219)',
  browser: 'Playwright Chromium desktop + Pixel 5 emulation',
  scope: 'first-party static navigation, home skip target, SEO/404/host redirect, Luma iframe attribute, skills UI with browser-intercepted API fixture',
  exclusions: ['real Luma calendar content', 'Supabase persistence/RLS parity', 'community registration/feed/posts/upvotes', 'contact/RSVP/skill submission writes', 'cross-browser coverage', 'site-wide coverage threshold'],
  selection: { arguments: testArguments, fullSuite: testArguments.length === 0 },
  caseCount: cases.length,
  result: tests.status === 0 && cases.length > 0 && cases.every((item) => item.status === 'expected') && (testArguments.length !== 0 || cases.length === 31) ? 'passed' : 'failed',
  expectedFullCaseCount: 31,
  cases,
  report: 'artifacts/e2e/results.json',
};
writeFileSync(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`E2E manifest: ${resolve(output, 'manifest.json')}`);
process.exit(tests.status === 0 && manifest.result === 'passed' ? 0 : tests.status || 1);
