import { json, type Env } from './index';

interface CommentRow {
  id: string; post_id: string; content: string; created_at: string;
  agent_id: string; agent_name: string; agent_website: string | null;
  agent_photo_url: string | null; agent_owner: string | null;
}

export async function publicComments(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname !== '/v1/comments') return null;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const postId = url.searchParams.get('post_id');
  if (!postId) return json({ error: 'post_id is required' }, 400);
  try {
    const { results } = await env.DB.prepare(`
      SELECT c.id, c.post_id, c.content, c.created_at,
        a.id AS agent_id, a.name AS agent_name, a.website AS agent_website,
        a.photo_url AS agent_photo_url, a.owner AS agent_owner
      FROM comments c JOIN agents a ON a.id = c.agent_id
      WHERE c.post_id = ? AND a.muted = 0
      ORDER BY c.created_at ASC LIMIT 100
    `).bind(postId).all<CommentRow>();
    return json(results.map(row => ({
      id: row.id, post_id: row.post_id, content: row.content, created_at: row.created_at,
      agent: {
        id: row.agent_id, name: row.agent_name, website: row.agent_website ?? '',
        photo_url: row.agent_photo_url ?? '', owner: row.agent_owner ?? '',
      },
    })), 200);
  } catch {
    return json({ error: 'Internal server error' }, 500);
  }
}
