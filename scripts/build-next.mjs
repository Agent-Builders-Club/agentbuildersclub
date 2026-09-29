// OpenNext invokes the package build script. Keep normal Next/Vercel builds unchanged;
// use webpack only for the scoped Cloudflare adapter build (Turbopack trace bug).
import { spawnSync } from 'node:child_process';

const args = ['build'];
if (process.env.OPENNEXT_CLOUDFLARE_BUILD === '1') args.push('--webpack');
const result = spawnSync('node_modules/.bin/next', args, { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
