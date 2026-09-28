// Measure tracked production sources with Vitest, then audit its file denominator.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawDirectory = path.join(root, 'coverage');
const artifactDirectory = path.join(root, 'artifacts/coverage');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

// This predicate mirrors vitest.config.ts's include/exclude list. Audit the
// reporter against git rather than trusting a potentially narrowed glob.
function ownedSource(file) {
  return (file === 'proxy.ts' || /^src\/.*\.tsx?$/.test(file)) &&
    !/\.(test|spec)\.tsx?$/.test(file) &&
    !file.endsWith('.d.ts') &&
    !file.startsWith('src/test/') &&
    !/(^|\/)(__fixtures__|fixtures)\//.test(file);
}

function metric(value, label) {
  if (!value || !Number.isSafeInteger(value.covered) ||
      !Number.isSafeInteger(value.total) || value.total < 0 ||
      value.covered < 0 || value.covered > value.total) {
    throw new Error(`Invalid ${label} coverage count`);
  }
  return { covered: value.covered, total: value.total,
    percent: value.total ? Number((100 * value.covered / value.total).toFixed(2)) : 100 };
}

try {
  // Do not allow a failed test run to leave a previous successful artifact.
  rmSync(rawDirectory, { recursive: true, force: true });
  rmSync(artifactDirectory, { recursive: true, force: true });
  const result = spawnSync('pnpm', ['exec', 'vitest', 'run', '--coverage.enabled'], {
    cwd: root, stdio: 'inherit', env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Vitest failed (exit ${result.status ?? result.signal})`);

  const tracked = git('ls-files', '-z', '--', 'src', 'proxy.ts')
    .split('\0').filter(ownedSource).sort();
  if (!tracked.length) throw new Error('No tracked production sources found');
  const expected = new Set(tracked);
  const report = JSON.parse(readFileSync(path.join(rawDirectory, 'coverage-summary.json'), 'utf8'));
  const entries = Object.entries(report).filter(([name]) => name !== 'total');
  const files = {};
  for (const [name, counts] of entries) {
    const relative = path.relative(root, path.resolve(root, name)).split(path.sep).join('/');
    if (!expected.has(relative) || files[relative]) {
      throw new Error(`Unexpected or duplicate coverage file: ${relative}`);
    }
    files[relative] = {
      lines: metric(counts.lines, `${relative} lines`),
      statements: metric(counts.statements, `${relative} statements`),
    };
  }
  const missing = tracked.filter(file => !files[file]);
  if (missing.length) throw new Error(`Missing zero-coverage files: ${missing.join(', ')}`);
  const totals = {};
  for (const key of ['lines', 'statements']) {
    const covered = tracked.reduce((sum, file) => sum + files[file][key].covered, 0);
    const total = tracked.reduce((sum, file) => sum + files[file][key].total, 0);
    const reported = metric(report.total?.[key], `reported total ${key}`);
    if (covered !== reported.covered || total !== reported.total) {
      throw new Error(`Per-file ${key} counts disagree with Vitest total`);
    }
    totals[key] = reported;
  }
  const zeroFiles = tracked.filter(file => files[file].statements.covered === 0);
  const summary = {
    schemaVersion: 1,
    commit: git('rev-parse', 'HEAD'),
    runner: 'Vitest V8 (Node test process)',
    scope: 'Tracked src/**/*.{ts,tsx} and proxy.ts, excluding tests, declarations and fixtures',
    limitations: [
      'Only source executed inside Vitest tests is credited; unimported files remain zero.',
      'Production Next.js server, prerender, Node proxy and browser Playwright execution are not collected or merged.',
      'No 75% threshold is enforced.',
    ],
    fileCount: tracked.length,
    totals,
    zeroStatementFileCount: zeroFiles.length,
    zeroStatementFiles: zeroFiles,
    files: Object.fromEntries(tracked.map(file => [file, files[file]])),
  };
  mkdirSync(artifactDirectory, { recursive: true });
  writeFileSync(path.join(artifactDirectory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(`Audited ${tracked.length} tracked production files; ${zeroFiles.length} with zero covered statements.`);
  console.log(`Lines ${totals.lines.covered}/${totals.lines.total} (${totals.lines.percent}%); statements ${totals.statements.covered}/${totals.statements.total} (${totals.statements.percent}%).`);
  console.log('Sanitized artifact: artifacts/coverage/summary.json');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
