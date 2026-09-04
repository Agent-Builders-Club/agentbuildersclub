import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Mock @/lib/supabase with proper chainable query builder.
 */

const mockDb: Record<string, any[]> = {
  agents: [],
  posts: [],
  upvotes: [],
  reports: [],
};

function createQueryBuilder(table: string) {
  const store = mockDb[table] ?? [];

  function runEqChain(args: any[]): any[] {
    let result = store;
    for (let i = 0; i < args.length; i += 2) {
      const field = args[i];
      const value = args[i + 1];
      result = result.filter((r: any) => r[field] === value);
    }
    return result;
  }

  return {
    select: (...args: any[]) => {
      const hasCountOpts = args.length >= 2 && args[1] && args[1].count;

      if (hasCountOpts) {
        // select('*', { count: 'exact', head: true }) for counting
        return {
          eq: (field: string, value: any) => ({
            count: store.filter(r => r[field] === value).length,
          }),
        };
      }

      return {
        in: (inField: string, values: any[]) => ({
          then: (resolve: (val: { data: any[]; error: null }) => void) => {
            resolve({ data: store.filter((r: any) => values.includes(r[inField])), error: null });
          },
        }),
        eq: (f1: string, v1: any) => ({
          eq: (f2: string, v2: any) => ({
            single: () => Promise.resolve({ data: runEqChain([f1, v1, f2, v2])[0] ?? null, error: null }),
            then: (resolve: (val: { data: any[]; error: null }) => void) => {
              resolve({ data: runEqChain([f1, v1, f2, v2]), error: null });
            },
          }),
          in: (inField: string, values: any[]) => ({
            then: (resolve: (val: { data: any[]; error: null }) => void) => {
              const eqFiltered = runEqChain([f1, v1]);
              resolve({ data: eqFiltered.filter((r: any) => values.includes(r[inField])), error: null });
            },
          }),
          order: (orderField: string, _opts?: any) => ({
            then: (resolve: (val: { data: any[]; error: null }) => void) => {
              const sorted = [...runEqChain([f1, v1])].sort((a: any, b: any) => {
                return new Date(b[orderField]).getTime() - new Date(a[orderField]).getTime();
              });
              resolve({ data: sorted, error: null });
            },
            limit: (n: number) => ({
              then: (resolve: (val: { data: any[]; error: null }) => void) => {
                const sorted = [...runEqChain([f1, v1])].sort((a: any, b: any) => {
                  return new Date(b[orderField]).getTime() - new Date(a[orderField]).getTime();
                });
                resolve({ data: sorted.slice(0, n), error: null });
              },
            }),
          }),
          then: (resolve: (val: { data: any[]; error: null }) => void) => {
            resolve({ data: runEqChain([f1, v1]), error: null });
          },
        }),
        order: (orderField: string, _opts?: any) => ({
          then: (resolve: (val: { data: any[]; error: null }) => void) => {
            const sorted = [...store].sort((a: any, b: any) => {
              return new Date(b[orderField]).getTime() - new Date(a[orderField]).getTime();
            });
            resolve({ data: sorted, error: null });
          },
          limit: (n: number) => ({
            then: (resolve: (val: { data: any[]; error: null }) => void) => {
              const sorted = [...store].sort((a: any, b: any) => {
                return new Date(b[orderField]).getTime() - new Date(a[orderField]).getTime();
              });
              resolve({ data: sorted.slice(0, n), error: null });
            },
          }),
        }),
        then: (resolve: (val: { data: any[]; error: null }) => void) => {
          resolve({ data: store, error: null });
        },
      };
    },
    insert: (data: any) => {
      store.push(data);
      const deferred: any = {
        then: (resolve: (val: any) => void) => {
          resolve({ data, error: null });
        },
        select: () => ({
          single: () => Promise.resolve({ data, error: null }),
        }),
      };
      return deferred;
    },
    update: (data: any) => ({
      eq: (field: string, value: any) => {
        const row = store.find(r => r[field] === value);
        if (row) Object.assign(row, data);
        return Promise.resolve({ error: null });
      },
    }),
    delete: () => {
      const filters: [string, any][] = [];
      const run = () => {
        const removed = store.filter(r => filters.every(([k,v]) => r[k] === v));
        removed.forEach(r => store.splice(store.indexOf(r), 1));
        return { data: removed, error: null };
      };
      const query: any = {
        eq: (k: string, v: any) => { filters.push([k,v]); return query; },
        select: () => query,
        then: (resolve: any) => Promise.resolve(run()).then(resolve),
      };
      return query;
    },
  };
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => createQueryBuilder(table),
    rpc: async () => ({ data: [], error: null }),
  },
}));

import {
  createAgent,
  getAgents,
  updateAgentMuted,
  deleteAgent,
  createPost,
  deletePost,
  toggleUpvote,
  createReport,
} from '@/lib/community-db';

describe('community-db', () => {
  beforeEach(() => {
    mockDb.agents = [];
    mockDb.posts = [];
    mockDb.upvotes = [];
    mockDb.reports = [];
  });

  // ————————————————————————————————————
  // AGENTS
  // ————————————————————————————————————
  describe('createAgent', () => {
    it('creates an agent with all required fields', async () => {
      const result = await createAgent({
        name: 'MyBot',
        description: 'A helpful bot',
        owner: 'Tyler',
        website: 'https://mybot.dev',
      });

      expect(result).not.toBeNull();
      expect(result!.agent.name).toBe('MyBot');
      expect(result!.agent.description).toBe('A helpful bot');
      expect(result!.agent.owner).toBe('Tyler');
      expect(result!.agent.website).toBe('https://mybot.dev');
      expect(result!.agent.muted).toBe(false);
      expect(result!.api_key).toBeDefined();
      expect(result!.api_key.length).toBeGreaterThan(10);
    });

    it('generates unique IDs for each agent', async () => {
      const r1 = await createAgent({ name: 'A', description: '', owner: '', website: '' });
      const r2 = await createAgent({ name: 'B', description: '', owner: '', website: '' });
      expect(r1!.agent.id).not.toBe(r2!.agent.id);
    });

    it('sets api_key independently from id', async () => {
      const result = await createAgent({ name: 'X', description: '', owner: '', website: '' });
      expect(result!.agent.api_key).toBeDefined();
      expect(result!.agent.api_key).not.toBe(result!.agent.id);
    });
  });

  describe('getAgents', () => {
    it('returns empty array when no agents', async () => {
      const agents = await getAgents();
      expect(agents).toEqual([]);
    });

    it('returns agents sorted by created_at desc', async () => {
      mockDb.agents.push({ id: 'a1', name: 'First', description: '', owner: '', website: '', api_key: 'k1', muted: false, created_at: '2026-01-01T00:00:00Z' });
      mockDb.agents.push({ id: 'a2', name: 'Second', description: '', owner: '', website: '', api_key: 'k2', muted: false, created_at: '2026-01-02T00:00:00Z' });

      const agents = await getAgents();
      expect(agents[0].name).toBe('Second');
      expect(agents[1].name).toBe('First');
    });
  });

  describe('updateAgentMuted', () => {
    it('updates muted to true', async () => {
      mockDb.agents.push({ id: 'a1', name: 'Test', description: '', owner: '', website: '', api_key: 'k1', muted: false, created_at: '' });

      const result = await updateAgentMuted('a1', true);
      expect(result).toBe(true);
      expect(mockDb.agents[0].muted).toBe(true);
    });

    it('returns true even for non-existent agent', async () => {
      const result = await updateAgentMuted('nonexistent', true);
      expect(result).toBe(true);
    });
  });

  describe('deleteAgent', () => {
    it('deletes an existing agent', async () => {
      mockDb.agents.push({ id: 'a1', name: 'ToDelete', description: '', owner: '', website: '', api_key: 'k1', muted: false, created_at: '' });

      const result = await deleteAgent('a1');
      expect(result).toBe(true);
      expect(mockDb.agents.length).toBe(0);
    });

    it('returns true when agent does not exist', async () => {
      const result = await deleteAgent('nonexistent');
      expect(result).toBe(true);
    });
  });

  // ————————————————————————————————————
  // POSTS
  // ————————————————————————————————————
  describe('createPost', () => {
    it('creates a post with all fields', async () => {
      mockDb.agents.push({ id: 'a1', name: 'Test', description: '', owner: '', website: '', api_key: 'k1', muted: false, created_at: '' });

      const post = await createPost({
        agent_id: 'a1',
        content: 'Hello world!',
        image_url: 'https://img.dev/pic.png',
        parent_id: 'parent-1',
      });

      expect(post).not.toBeNull();
      expect(post!.content).toBe('Hello world!');
      expect(post!.image_url).toBe('https://img.dev/pic.png');
      expect(post!.parent_id).toBe('parent-1');
      expect(post!.agent_id).toBe('a1');
    });

    it('creates post with null optional fields', async () => {
      const post = await createPost({ agent_id: 'a1', content: 'No extras' });
      expect(post).not.toBeNull();
      expect(post!.image_url).toBeNull();
      expect(post!.parent_id).toBeNull();
    });
  });

  describe('deletePost', () => {
    it('deletes an existing post', async () => {
      mockDb.posts.push({ id: 'p1', agent_id: 'a1', content: 'To delete', image_url: null, parent_id: null, created_at: '' });

      const result = await deletePost('p1', 'a1');
      expect(result).toBe(true);
      expect(mockDb.posts.length).toBe(0);
    });

    it('returns false for non-existent post', async () => {
      const result = await deletePost('nonexistent', 'a1');
      expect(result).toBe(false);
    });
  });

  // ————————————————————————————————————
  // UPVOTES
  // ————————————————————————————————————
  describe('toggleUpvote', () => {
    it('adds upvote when none exists', async () => {
      const result = await toggleUpvote('p1', 'a1');
      expect(result).not.toBeNull();
      expect(result!.upvoted).toBe(true);
      expect(result!.count).toBe(1);
    });

    it('removes upvote when already exists', async () => {
      mockDb.upvotes.push({ id: 'u1', post_id: 'p1', agent_id: 'a1', created_at: '' });

      const result = await toggleUpvote('p1', 'a1');
      expect(result!.upvoted).toBe(false);
      expect(result!.count).toBe(0);
    });

    it('toggles correctly across multiple operations', async () => {
      const r1 = await toggleUpvote('p1', 'a1');
      expect(r1!.upvoted).toBe(true);

      const r2 = await toggleUpvote('p1', 'a1');
      expect(r2!.upvoted).toBe(false);

      const r3 = await toggleUpvote('p1', 'a1');
      expect(r3!.upvoted).toBe(true);
    });

    it('counts multiple upvotes for different agents', async () => {
      mockDb.upvotes.push({ id: 'u1', post_id: 'p1', agent_id: 'a1', created_at: '' });
      mockDb.upvotes.push({ id: 'u2', post_id: 'p1', agent_id: 'a2', created_at: '' });

      const result = await toggleUpvote('p1', 'a1'); // removes a1's upvote
      expect(result!.count).toBe(1); // a2's upvote remains
    });
  });

  // ————————————————————————————————————
  // REPORTS
  // ————————————————————————————————————
  describe('createReport', () => {
    it('creates a report for a post', async () => {
      const result = await createReport('p1');
      expect(result).toBe(true);
      expect(mockDb.reports.length).toBe(1);
      expect(mockDb.reports[0].post_id).toBe('p1');
    });
  });
});
