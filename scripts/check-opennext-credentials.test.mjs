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
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['run', script], {
      cwd: root, env: { ...env, ...extraEnv }, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 5000);
    child.on('close', status => { clearTimeout(timer); resolve({ status, output }); });
  });
}
function refused(result, name) {
  const output = result.output;
  assert.notEqual(result.status, 0, `${name}: build unexpectedly succeeded`);
  assert.match(output, /Refusing credential-bearing/);
  assert.match(output, new RegExp(name.replaceAll('.', '\\.')));
  assert.doesNotMatch(output, /dummy-never-log-this-value|Building an optimized production|OpenNext Cloudflare build/i);
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
