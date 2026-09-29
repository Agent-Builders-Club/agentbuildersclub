import { json, type Env } from './index';

interface SkillRow {
  id: string; name: string; description: string; category: string;
  trigger_phrases: string; instructions: string; submitted_by: string;
  install_count: number; created_at: string;
}

export async function publicSkills(request: Request, env: Env, pathname: string): Promise<Response | null> {
  const list = pathname === '/v1/skills';
  const match = /^\/v1\/skills\/([^/]+)\/export$/.exec(pathname);
  if (!list && !match) return null;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  // Agent identity/personalized responses are not part of this private server hop.
  if (request.headers.has('x-api-key')) return json({ error: 'Authenticated skills unavailable' }, 501);
  try {
    if (list) {
      const { results } = await env.DB.prepare(`
        SELECT id, name, description, category, trigger_phrases, instructions,
          submitted_by, install_count, created_at FROM skills
        WHERE approved = 1 AND flagged = 0
        ORDER BY install_count DESC, created_at DESC
      `).bind().all<SkillRow>();
      return json(results.map(row => ({
        id: row.id, name: row.name, description: row.description,
        category: row.category, trigger_phrases: JSON.parse(row.trigger_phrases),
        instructions: row.instructions, submitter_name: row.submitted_by,
        install_count: row.install_count, created_at: row.created_at,
      })), 200);
    }
    // The query is parameter-bound; unknown, private, and malicious identifiers
    // all have the same outward response.
    let id: string;
    try { id = decodeURIComponent(match![1]); }
    catch { return json({ error: 'Skill not found' }, 404); }
    let row: SkillRow | null;
    try {
      row = await env.DB.prepare(`
        SELECT id, name, description, category, trigger_phrases, instructions,
          submitted_by, install_count, created_at FROM skills
        WHERE id = ? AND approved = 1 AND flagged = 0
      `).bind(id).first<SkillRow>();
    } catch { return json({ error: 'Skill not found' }, 404); }
    if (!row) return json({ error: 'Skill not found' }, 404);
    const safeName = row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const clawpack = {
      format: 'clawpack-v1', version: '1.0', name: row.name,
      description: row.description, instructions: row.instructions,
      trigger_phrases: JSON.parse(row.trigger_phrases), category: row.category,
      metadata: {
        submitted_by: row.submitted_by,
        exported_at: new Date().toISOString(), source: 'agentbuildersclub.dev',
      },
    };
    return new Response(JSON.stringify(clawpack, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${safeName}.clawpack"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return json({ error: 'Server error' }, 500);
  }
}
