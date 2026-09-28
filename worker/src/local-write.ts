// Only wrangler.local.jsonc imports this test-only entrypoint. Never deploy it.
import feed, { authorized, json, type Env } from './index';

async function rotate(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (request.headers.get('Content-Type') !== 'application/json') return json({ error: 'Invalid rotation' }, 400);
  const reader = request.body?.getReader();
  if (!reader) return json({ error: 'Invalid rotation' }, 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512) { await reader.cancel(); return json({ error: 'Invalid rotation' }, 400); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const input: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'Invalid rotation' }, 400);
    const data = input as Record<string, unknown>;
    if (Object.keys(data).sort().join(',') !== 'agent_id,expected_digest,new_digest,operation_id' ||
        typeof data.agent_id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(data.agent_id) ||
        typeof data.operation_id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(data.operation_id) ||
        typeof data.expected_digest !== 'string' || !/^[0-9a-f]{64}$/.test(data.expected_digest) ||
        typeof data.new_digest !== 'string' || !/^[0-9a-f]{64}$/.test(data.new_digest) ||
        data.expected_digest === data.new_digest) return json({ error: 'Invalid rotation' }, 400);
    try {
      // One SQLite UPDATE is the CAS. The audit trigger is part of the same
      // statement: an audit constraint failure aborts and rolls back the update.
      const result = await env.DB.prepare(`
        UPDATE local_key_versions SET digest = ?, version = version + 1, last_operation_id = ?
        WHERE agent_id = ? AND digest = ? RETURNING version
      `).bind(data.new_digest, data.operation_id, data.agent_id, data.expected_digest).first<{ version: number }>();
      return result ? json({ version: result.version }, 200) : json({ error: 'Rotation conflict' }, 409);
    } catch {
      return json({ error: 'Rotation unavailable' }, 503);
    }
  } catch {
    return json({ error: 'Invalid rotation' }, 400);
  }
}

const localHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Keep the same auth-before-routing contract as the default feed handler.
    if (!await authorized(request, env.INTERNAL_API_TOKEN)) return json({ error: 'Unauthorized' }, 401);
    const url = new URL(request.url);
    if (url.pathname === '/v1/local-write/rotate' && (env as Env & { LOCAL_WRITE_CONTRACT?: string }).LOCAL_WRITE_CONTRACT === 'enabled') {
      if (url.search) return json({ error: 'Not found' }, 404);
      return rotate(request, env);
    }
    return feed.fetch(request, env);
  },
};

export default localHandler;
