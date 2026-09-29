import { readdirSync } from 'node:fs';

export function checkOpenNextCredentials() {
  const files = readdirSync(process.cwd()).filter(name =>
    name !== '.env.example' && (name.startsWith('.env') || name.startsWith('.dev.vars'))
  );
  const variables = Object.keys(process.env).filter(name =>
    /^(?:SUPABASE(?:_|$)|NEXT_PUBLIC_SUPABASE(?:_|$)|DATABASE_URL$|CLAWPLEX_ADMIN_|RESEND_API_KEY$)/i.test(name)
  );
  if (files.length || variables.length) {
    throw new Error(`Refusing credential-bearing local build: files [${files.join(', ')}]; environment variables [${variables.join(', ')}]. Remove them before build:cf/preview:cf.`);
  }
}
