import { readdirSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'artifacts/e2e');
mkdirSync(output, { recursive: true });
const envFiles = readdirSync(root).filter((name) => /^\.env(?:\.|$)/.test(name) && name !== '.env.example');
const credentialNames = Object.keys(process.env).filter((key) => /SUPABASE|DATABASE_URL|CLAWPLEX_ADMIN_API_KEY/.test(key));
if (envFiles.length || credentialNames.length) {
  console.error(`E2E refuses local env files or database credentials (files: ${envFiles.join(', ') || 'none'}; variable names: ${credentialNames.join(', ') || 'none'}). Remove them before running; no live DB is needed.`);
  process.exit(2);
}
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
rmSync(resolve(output, 'results.json'), { force: true });
rmSync(resolve(output, 'manifest.json'), { force: true });
const run = (binary, args) => spawnSync(resolve(root, 'node_modules/.bin', binary), args, { cwd: root, env, stdio: 'inherit' });
const build = run('next', ['build']);
if (build.error || build.status !== 0) process.exit(build.status || 1);
const tests = run('playwright', ['test', ...process.argv.slice(2)]);
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
  schema: 1,
  server: 'next build + next start (127.0.0.1:3217)',
  browser: 'Playwright Chromium desktop + Pixel 5 emulation',
  scope: 'first-party static navigation, home skip target, SEO/404/host redirect, Luma iframe attribute, skills UI with browser-intercepted API fixture',
  exclusions: ['real Luma calendar content', 'Supabase persistence/RLS parity', 'community registration/feed/posts/upvotes', 'contact/RSVP/skill submission writes', 'cross-browser coverage', 'site-wide coverage threshold'],
  result: tests.status === 0 && cases.length > 0 && cases.every((item) => item.status === 'expected') ? 'passed' : 'failed',
  cases,
  report: 'artifacts/e2e/results.json',
};
writeFileSync(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`E2E manifest: ${resolve(output, 'manifest.json')}`);
process.exit(tests.status === 0 && manifest.result === 'passed' ? 0 : tests.status || 1);
