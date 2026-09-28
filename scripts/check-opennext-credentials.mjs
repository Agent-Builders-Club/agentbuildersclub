// Run before OpenNext starts Next's build; do not inspect or print file contents.
import { readdirSync } from 'node:fs';

const files = readdirSync(process.cwd()).filter(name =>
  name !== '.env.example' && (name.startsWith('.env') || name.startsWith('.dev.vars'))
);
const variables = Object.keys(process.env).filter(name =>
  /^(?:SUPABASE(?:_|$)|NEXT_PUBLIC_SUPABASE(?:_|$)|DATABASE_URL$|CLAWPLEX_ADMIN_|RESEND_API_KEY$)/i.test(name)
);
if (files.length || variables.length) {
  throw new Error(`Refusing credential-bearing local build: files [${files.join(', ')}]; environment variables [${variables.join(', ')}]. Remove them before build:cf/preview:cf.`);
}
