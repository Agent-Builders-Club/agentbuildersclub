// Isolated CI-only Next 16 Babel/Webpack build and private production E2E probe.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const artifact = path.join(root, 'artifacts/coverage');
const routeDir = path.join(root, 'src/app/api/coverage-canary');
const pageDir = path.join(root, 'src/app/coverage-canary');
const babel = path.join(root, '.babelrc');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
rmSync(artifact, { recursive: true, force: true }); // Failed run must not retain prior PASS.
mkdirSync(artifact, { recursive: true });
if (readdirSync(root).includes('.babelrc') || readdirSync(root).includes('babel.config.js')) throw new Error('Refusing to replace Babel configuration');
if (readdirSync(path.join(root, 'src/app/api')).includes('coverage-canary') || readdirSync(path.join(root, 'src/app')).includes('coverage-canary')) throw new Error('Refusing to replace canary source');
const tracked = git('ls-files', '-z', '--', 'src', 'proxy.ts').split('\0').filter(file =>
  (file === 'proxy.ts' || /^src\/.*\.tsx?$/.test(file)) && !/\.(test|spec)\.tsx?$/.test(file) &&
  !file.endsWith('.d.ts') && !file.startsWith('src/test/') && !/(^|\/)(__fixtures__|fixtures)\//.test(file)).sort();
let state = { schemaVersion: 1, result: 'BLOCKED', commit: git('rev-parse', 'HEAD'), next: '16.3.6', bundler: 'Webpack', instrumenter: 'next/babel + babel-plugin-istanbul@7.0.1',
  scope: 'Tracked owned src TS/TSX and proxy.ts; exclude tests, declarations and fixtures', eligibleFileCount: tracked.length, eligibleFiles: tracked,
  creditedProductionFileCount: null, productionStatementTotals: null, productionLineTotals: null,
  runtimes: { node: 'not exercised until build succeeds', chromium: 'not exercised until build succeeds', buildPrerender: 'uncredited', edgeProxy: 'uncredited', vitest: 'separate baseline, no location union' },
  limitations: ['Canaries are temporary CI-only sources, not deployed.', 'No production-wide percentage or 75% gate without full zero-inclusive location-compatible maps.', 'Raw counters remain private in next16-private and must not be uploaded.'] };
function save() { writeFileSync(path.join(artifact, 'next16-canary.json'), JSON.stringify(state, null, 2) + '\n'); }
save();
try {
  mkdirSync(routeDir); mkdirSync(pageDir);
  writeFileSync(path.join(routeDir, 'route.ts'), `import { NextResponse } from 'next/server';\n\nexport async function GET(request: Request) {\n  const mode = new URL(request.url).searchParams.get('mode');\n  if (mode === 'taken') {\n    return NextResponse.json({ value: 'SERVER_TAKEN' });\n  } else {\n    return NextResponse.json({ value: 'SERVER_UNTAKEN' });\n  }\n}\n`);
  writeFileSync(path.join(pageDir, 'client.tsx'), `'use client';\nimport { useState } from 'react';\nexport default function Client() {\n  const [value, setValue] = useState('READY');\n  function click() {\n    if (value === 'READY') {\n      setValue('CLIENT_TAKEN');\n    } else {\n      setValue('CLIENT_UNTAKEN');\n    }\n  }\n  return <><button onClick={click}>Run client canary</button><span>{value}</span></>;\n}\n`);
  writeFileSync(path.join(pageDir, 'page.tsx'), `import Client from './client';\nexport default function Page() { return <Client />; }\n`);
  writeFileSync(babel, JSON.stringify({ presets: ['next/babel'], plugins: [['istanbul', { include: ['src/**/*.{ts,tsx}', 'proxy.ts'], exclude: ['**/*.test.*', '**/*.spec.*', '**/*.d.ts'], useInlineSourceMaps: false }]] }));
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
  const build = spawnSync('pnpm', ['exec', 'next', 'build', '--webpack'], { cwd: root, env, encoding: 'utf8', maxBuffer: 10_000_000, timeout: 300_000 });
  writeFileSync(path.join(artifact, 'build.log'), (build.stdout || '') + (build.stderr || ''));
  if (build.status !== 0) throw new Error(`next build --webpack failed (${build.status ?? build.signal}); see build.log`);
  const e2e = spawnSync(process.execPath, ['scripts/production-coverage-e2e.mjs'], { cwd: root, env, encoding: 'utf8', timeout: 120_000 });
  writeFileSync(path.join(artifact, 'e2e.log'), (e2e.stdout || '') + (e2e.stderr || ''));
  if (e2e.status !== 0) throw new Error(`Production Node/Chromium source-line E2E failed (${e2e.status ?? e2e.signal}); see e2e.log`);
  state.proof = JSON.parse(e2e.stdout.trim().split('\n').at(-1));
  state.result = 'PASS_CANARIES_ONLY';
  console.log(e2e.stdout);
} catch (error) {
  state.blocker = String(error);
  if (readdirSync(artifact).includes('build.log')) {
    const buildLog = readFileSync(path.join(artifact, 'build.log'), 'utf8');
    if (buildLog.includes('"next/font" requires SWC')) state.blocker = 'Next 16.3.6 rejects custom Babel configuration with next/font in src/app/layout.tsx: next/font requires SWC. The webpack production build did not compile; no Node or Chromium counters were collected.';
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  rmSync(babel, { force: true });
  rmSync(routeDir, { recursive: true, force: true });
  rmSync(pageDir, { recursive: true, force: true });
  save();
  console.log(`Repeatable artifact: ${path.relative(root, path.join(artifact, 'next16-canary.json'))}`);
}
