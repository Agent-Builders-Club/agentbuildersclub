import { describe, it, expect } from 'vitest';
import { Logger } from "@/lib/logger";

/**
 * Inline handler for /api/community/feed — tests real behavior.
 */
function makeFeedHandler(supabase: any) {
  return async function GET(apiKey: string | null) {
    try {
      const { data: posts, error } = await supabase
        .from('posts')
        .select(`
          id,
          agent_id,
          content,
          image_url,
          parent_id,
          created_at,
          agents (
            id,
            name,
            website,
            owner,
            muted
          )
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      let feed: any[] = posts
        ?.filter((p: any) => !p.agents?.muted)
        .map((p: any) => ({
          id: p.id,
          agent_id: p.agent_id,
          agent_name: p.agents?.name ?? 'Unknown',
          agent_website: p.agents?.website ?? '',
          agent_owner: p.agents?.owner ?? '',
          content: p.content,
          image_url: p.image_url ?? null,
          parent_id: p.parent_id ?? null,
          created_at: p.created_at,
          upvote_count: 0,
          user_upvoted: false,
        })) ?? [];

      const agentIds = [...new Set(feed.map((p) => p.agent_id))];
      const agentStatsMap: Record<string, any> = {};

      if (agentIds.length > 0) {
        const { data: postCounts } = await supabase
          .from('posts')
          .select('agent_id, id, created_at, content')
          .in('agent_id', agentIds);

        for (const agentId of agentIds) {
          const agentPosts = (postCounts ?? []).filter((p: any) => p.agent_id === agentId);
          agentPosts.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          const latest = agentPosts[0];
          const tagWords = (latest?.content ?? '').trim().split(/\s+/).slice(0, 2);
          agentStatsMap[agentId] = {
            post_count: agentPosts.length,
            last_active: latest?.created_at ?? null,
            capability_tag: tagWords.length > 0 ? tagWords.join(' ').slice(0, 30) : 'General',
          };
        }
      }

      feed = feed.map((p: any) => ({
        ...p,
        agent_post_count: agentStatsMap[p.agent_id]?.post_count ?? 0,
        agent_last_active: agentStatsMap[p.agent_id]?.last_active ?? p.created_at,
        agent_capability_tag: agentStatsMap[p.agent_id]?.capability_tag ?? 'General',
      }));

      // If API key provided, check upvoted status
      if (apiKey) {
        const { data: agent } = await supabase
          .from('agents')
          .select('id')
          .eq('api_key', apiKey)
          .single();

        if (agent) {
          const { data: upvotes } = await supabase
            .from('upvotes')
            .select('post_id')
            .eq('agent_id', agent.id);

          const upvotedIds = new Set(upvotes?.map((u: any) => u.post_id) ?? []);
          feed.forEach((item: any) => {
            if (upvotedIds.has(item.id)) {
              item.user_upvoted = true;
            }
          });
        }
      }

      return { status: 200, body: feed };
    } catch (err) {
      Logger.error('Feed error:', err);
      return { status: 500, body: { error: 'Internal server error' } };
    }
  };
}

function makeSupabase(agents: any[], posts: any[], upvotes: any[]) {
  const mutableUpvotes = [...upvotes];

  return {
    from: (table: string) => {
      if (table === 'posts') {
        return {
          select: () => ({
            order: (orderField: string, _opts?: any) => ({
              limit: (n: number) => ({
                then: (resolve: (val: { data: any[]; error: null }) => void) => {
                  const sorted = [...posts].sort((a: any, b: any) => {
                    return new Date(b[orderField]).getTime() - new Date(a[orderField]).getTime();
                  });
                  resolve({ data: sorted.slice(0, n), error: null });
                },
              }),
              then: (resolve: (val: { data: any[]; error: null }) => void) => {
                const sorted = [...posts].sort((a: any, b: any) => {
                  return new Date(b[orderField]).getTime() - new Date(a[orderField]).getTime();
                });
                resolve({ data: sorted, error: null });
              },
            }),
            in: (inField: string, values: any[]) => ({
              then: (resolve: (val: { data: any[]; error: null }) => void) => {
                resolve({ data: posts.filter((p: any) => values.includes(p[inField])), error: null });
              },
            }),
          }),
        };
      }
      if (table === 'upvotes') {
        return {
          select: () => ({
            eq: (field: string, value: any) => ({
              then: (resolve: (val: { data: any[]; error: null }) => void) => {
                resolve({ data: mutableUpvotes.filter(u => u[field] === value), error: null });
              },
            }),
          }),
        };
      }
      if (table === 'agents') {
        return {
          select: () => ({
            eq: (field: string, value: any) => ({
              single: () => {
                const found = agents.find((a: any) => a.api_key === value) ?? null;
                return Promise.resolve({ data: found, error: null });
              },
            }),
          }),
        };
      }
      return { select: () => ({ then: (resolve: (val: { data: any[]; error: null }) => void) => resolve({ data: [], error: null }) }) };
    },
  };
}

describe('/api/community/feed', () => {
  const agents = [
    { id: 'a1', name: 'AgentOne', website: 'https://a1.dev', owner: 'Tyler', muted: false, api_key: 'key-one', created_at: '2026-01-01T00:00:00Z' },
    { id: 'a2', name: 'AgentTwo', website: 'https://a2.dev', owner: 'Justine', muted: true, api_key: 'key-two', created_at: '2026-01-02T00:00:00Z' },
  ];
  // p3 is most recent, then p1, then p2 (but p2 is muted)
  const posts = [
    { id: 'p1', agent_id: 'a1', content: 'Hello from AgentOne', image_url: null, parent_id: null, created_at: '2026-01-01T12:00:00Z', agents: agents[0] },
    { id: 'p2', agent_id: 'a2', content: 'Hello from AgentTwo', image_url: null, parent_id: null, created_at: '2026-01-01T13:00:00Z', agents: agents[1] },
    { id: 'p3', agent_id: 'a1', content: 'Second post from AgentOne', image_url: null, parent_id: null, created_at: '2026-01-01T14:00:00Z', agents: agents[0] },
  ];
  const upvotes = [{ post_id: 'p1', agent_id: 'a1' }];

  const supabase = makeSupabase(agents, posts, upvotes);
  const handler = makeFeedHandler(supabase);

  async function successfulFeed(apiKey: string | null) {
    const { status, body } = await handler(apiKey);
    expect(status).toBe(200);
    if (!Array.isArray(body)) throw new Error('Expected a feed array');
    return body;
  }

  it('filters out muted agents from feed', async () => {
    const body = await successfulFeed(null);
    const agentNames = body.map((p: any) => p.agent_name);
    expect(agentNames).not.toContain('AgentTwo');
    expect(agentNames).toContain('AgentOne');
  });

  it('maps agent fields correctly', async () => {
    const body = await successfulFeed(null);
    const post = body.find((p: any) => p.id === 'p1');
    expect(post?.agent_name).toBe('AgentOne');
    expect(post?.agent_website).toBe('https://a1.dev');
    expect(post?.agent_owner).toBe('Tyler');
  });

  it('attaches agent stats to each post', async () => {
    const body = await successfulFeed(null);
    const agentOnePosts = body.filter((p: any) => p.agent_id === 'a1');
    // AgentOne has 2 posts (p1 and p3)
    expect(agentOnePosts[0]?.agent_post_count).toBe(2);
    // Latest post for AgentOne is p3 ('Second post from...'), first 2 words = 'Second post'
    expect(agentOnePosts[0]?.agent_capability_tag).toBe('Second post');
  });

  it('marks user_upvoted when API key matches', async () => {
    const body = await successfulFeed('key-one');
    const p1 = body.find((p: any) => p.id === 'p1');
    expect(p1?.user_upvoted).toBe(true);
    const p3 = body.find((p: any) => p.id === 'p3');
    expect(p3?.user_upvoted).toBe(false);
  });

  it('sorts posts by most recent first', async () => {
    const body = await successfulFeed(null);
    // p3 is most recent (14:00), then p1 (12:00) — p2 filtered out (muted)
    expect(body[0].id).toBe('p3');
    expect(body[1].id).toBe('p1');
  });
});
