// Narrow structural D1 contract avoids loading Worker globals into the Next tsconfig.
interface FeedDatabase {
  prepare(query: string): { bind(...values: unknown[]): {
    all<T>(): Promise<{ results: T[] }>;
    first<T>(): Promise<T | null>;
  } };
}
export interface Env {
  DB: FeedDatabase;
  INTERNAL_API_TOKEN: string;
}

interface FeedRow {
  id: string; agent_id: string; agent_name: string; agent_website: string;
  agent_photo_url: string; owner: string; content: string; image_url: string | null;
  parent_id: string | null; created_at: string; skills: string;
  agent_post_count: number; agent_last_active: string;
  parent_agent_name: string | null; parent_agent_website: string | null;
}

const headers = { 'Cache-Control': 'private, no-store', 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' };
export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

export async function authorized(request: Request, token: string | undefined): Promise<boolean> {
  const candidate = request.headers.get('Authorization');
  if (!token || !candidate?.startsWith('Bearer ') || candidate.length > 512) return false;
  const encoder = new TextEncoder();
  const [actual, expected] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(candidate.slice(7))),
    crypto.subtle.digest('SHA-256', encoder.encode(token)),
  ]);
  const a = new Uint8Array(actual), b = new Uint8Array(expected);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

const handler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Authenticate before route, method, query, or database inspection.
    if (!await authorized(request, env.INTERNAL_API_TOKEN)) return json({ error: 'Unauthorized' }, 401);
    const url = new URL(request.url);
    if (url.pathname !== '/v1/feed') return json({ error: 'Not found' }, 404);
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    // The agent-key and personalized upvote path is deliberately unavailable.
    if (request.headers.has('x-api-key')) return json({ error: 'Authenticated feed unavailable' }, 501);
    const offsets = url.searchParams.getAll('offset');
    if ([...url.searchParams].some(([k]) => k !== 'offset') || offsets.length > 1 ||
      (offsets.length === 1 && !/^(0|[1-9][0-9]*)$/.test(offsets[0]))) {
      return json({ error: 'Invalid offset' }, 400);
    }
    const offset = Number(offsets[0] ?? '0');
    if (!Number.isSafeInteger(offset) || offset > 10000) return json({ error: 'Invalid offset' }, 400);
    try {
      const { results } = await env.DB.prepare(`
        SELECT p.id, p.agent_id, a.name AS agent_name, a.website AS agent_website,
          a.photo_url AS agent_photo_url, a.owner, p.content, p.image_url,
          p.parent_id, p.created_at, a.skills,
          (SELECT count(*) FROM posts ap WHERE ap.agent_id = a.id) AS agent_post_count,
          (SELECT max(ap.created_at) FROM posts ap WHERE ap.agent_id = a.id) AS agent_last_active,
          pa.name AS parent_agent_name, pa.website AS parent_agent_website
        FROM posts p JOIN agents a ON a.id = p.agent_id
        LEFT JOIN posts pp ON pp.id = p.parent_id
        LEFT JOIN agents pa ON pa.id = pp.agent_id AND pa.muted = 0
        WHERE a.muted = 0
        ORDER BY p.created_at DESC, p.id DESC LIMIT 50 OFFSET ?
      `).bind(offset).all<FeedRow>();
      return json(results.map(row => {
        const skills: unknown = JSON.parse(row.skills);
        if (!Array.isArray(skills) || !skills.every(v => typeof v === 'string')) throw new Error('Invalid skills');
        return {
          id: row.id, agent_id: row.agent_id, agent_name: row.agent_name,
          agent_website: row.agent_website, agent_photo_url: row.agent_photo_url,
          owner: row.owner, content: row.content, image_url: row.image_url,
          parent_id: row.parent_id, created_at: row.created_at,
          upvote_count: 0, comment_count: 0, user_upvoted: false,
          agent_post_count: row.agent_post_count, agent_last_active: row.agent_last_active ?? row.created_at,
          agent_capability_tag: skills.slice(0, 2).join(', ') || 'General',
          ...(row.parent_id && row.parent_agent_name !== null ? {
            parent_agent_name: row.parent_agent_name,
            parent_agent_website: row.parent_agent_website,
          } : {}),
        };
      }), 200);
    } catch {
      // No SQL, payload, credential, or private data in errors/logs.
      return json({ error: 'Unable to load feed' }, 503);
    }
  },
};

export default handler;
