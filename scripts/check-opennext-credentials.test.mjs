// Failure modes: Next can load .env* (including .env.production.local) during build;
// Wrangler can load .dev.vars*; inherited backend/admin credentials can reach the
// adapter build; a refusal must not reveal values or start compilation.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url).pathname;
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:SUPABASE(?:_|$)|NEXT_PUBLIC_SUPABASE(?:_|$)|DATABASE_URL$|CLAWPLEX_ADMIN_|RESEND_API_KEY$)/i.test(key)));
const dummy = 'dummy-never-log-this-value';
function invoke(script, extraEnv = {}) {
  return invokeArgs(['run', script], extraEnv);
}
function invokeArgs(args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', args, {
      cwd: root, env: { ...env, ...extraEnv }, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 10000);
    child.on('close', status => { clearTimeout(timer); resolve({ status, output, timedOut }); });
  });
}
function refused(result, name) {
  const output = result.output;
  assert.notEqual(result.status, 0, `${name}: CLI unexpectedly succeeded`);
  assert.equal(result.timedOut, false, `${name}: CLI hung instead of refusing`);
  assert.match(output, /Refusing credential-bearing/);
  assert.match(output, new RegExp(name.replaceAll('.', '\\.')));
  assert.doesNotMatch(output, /dummy-never-log-this-value|Building an optimized production|wrangler \d|Incremental cache does not need populating/i);
}

test('build:cf refuses inherited service and admin secrets before compilation', async () => {
  for (const name of ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CLAWPLEX_ADMIN_SECRET', 'DATABASE_URL']) {
    refused(await invoke('build:cf', { [name]: dummy }), name);
  }
});

test('build:cf refuses local Next and Wrangler credential files before compilation', async () => {
  for (const name of ['.env.production.local', '.env.preview', '.dev.vars.production']) {
    assert.equal(existsSync(root + name), false, `will not overwrite ${name}`);
    try {
      writeFileSync(root + name, `SUPABASE_SECRET_KEY=${dummy}\n`);
      refused(await invoke('build:cf'), name);
    } finally {
      unlinkSync(root + name);
    }
  }
});

test('direct OpenNext build refuses inherited credentials before compilation', async () => {
  refused(await invokeArgs(['exec', 'opennextjs-cloudflare', 'build'], { SUPABASE_SECRET_KEY: dummy }), 'SUPABASE_SECRET_KEY');
});

test('direct OpenNext build refuses local credential files before compilation', async () => {
  const name = '.env.production.local';
  assert.equal(existsSync(root + name), false, `will not overwrite ${name}`);
  try {
    writeFileSync(root + name, `SUPABASE_SECRET_KEY=${dummy}\n`);
    refused(await invokeArgs(['exec', 'opennextjs-cloudflare', 'build']), name);
  } finally {
    unlinkSync(root + name);
  }
});

test('direct OpenNext preview refuses inherited credentials before Wrangler', async () => {
  refused(await invokeArgs(['exec', 'opennextjs-cloudflare', 'preview', '--ip', '127.0.0.1', '--port', '8797'], { SUPABASE_SECRET_KEY: dummy }), 'SUPABASE_SECRET_KEY');
});

test('direct OpenNext preview refuses local credential files before Wrangler', async () => {
  const name = '.dev.vars.preview';
  assert.equal(existsSync(root + name), false, `will not overwrite ${name}`);
  try {
    writeFileSync(root + name, `SUPABASE_SECRET_KEY=${dummy}\n`);
    refused(await invokeArgs(['exec', 'opennextjs-cloudflare', 'preview', '--ip', '127.0.0.1', '--port', '8797']), name);
  } finally {
    unlinkSync(root + name);
  }
});

test('preview:cf refuses inherited and file credentials before launching Wrangler', async () => {
  refused(await invoke('preview:cf', { SUPABASE_SECRET_KEY: dummy }), 'SUPABASE_SECRET_KEY');
  const name = '.dev.vars.preview';
  assert.equal(existsSync(root + name), false, `will not overwrite ${name}`);
  try {
    writeFileSync(root + name, `SUPABASE_SECRET_KEY=${dummy}\n`);
    refused(await invoke('preview:cf'), name);
  } finally {
    unlinkSync(root + name);
  }
});
