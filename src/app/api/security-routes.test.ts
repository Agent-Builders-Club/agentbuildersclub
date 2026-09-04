import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { hashApiKey } from "@/lib/api-key";

const db = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: db }));
import { GET as directory } from "./agents/route";
import { POST as rotateKey } from "./community/key/route";
import { POST as mute } from "./community/admin/mute/[agentId]/route";
import { POST as follow } from "./community/agents/[id]/route";
import { DELETE as deletePost, POST as post } from "./community/post/route";
import { POST as report } from "./community/report/[postId]/route";
import { POST as match } from "./agents/match/route";
import { POST as comment } from "./community/comments/route";
import { checkRateLimit } from "@/lib/rate-limit";

type Row = Record<string, unknown>;
let rows: Record<string, Row[]>;
let failReports = false;
function query(table: string) {
  let operation = "read"; let updates: Row = {}; let columns = "*"; const filters: [string, unknown][] = [];
  const result = () => {
    let found = (rows[table] ?? []).filter(r => filters.every(([k,v]) => r[k] === v));
    if (operation === "update") found.forEach(r => Object.assign(r, updates));
    if (operation === "delete") rows[table] = (rows[table] ?? []).filter(r => !found.includes(r));
    if (columns !== "*") found = found.map(r => Object.fromEntries(columns.split(",").map(k => [k.trim(), r[k.trim()]])));
    return { data: found, error: failReports && table === "reports" ? { message: "write failed" } : null };
  };
  const q = {
    select: (c = "*") => { columns = c; return q; },
    eq: (k: string,v: unknown) => { filters.push([k,v]); return q; },
    neq: () => q, order: () => q, limit: () => q,
    update: (data: Row) => { operation = "update"; updates = data; return q; },
    delete: () => { operation = "delete"; return q; },
    insert: (data: Row) => { if (!failReports) (rows[table] ??= []).push(data); return q; },
    single: async () => { const r = result(); return { ...r, data: r.data[0] ?? null }; },
    then: (resolve: (r: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
  }; return q;
}
const req = (method: string, body?: unknown, key?: string, path = "/") => new NextRequest(`http://localhost${path}`, {
  method, headers: { "Content-Type": "application/json", ...(key ? { "x-api-key": key } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
beforeEach(() => {
  vi.clearAllMocks();
  rows = { agents: [{ id: "a", name: "A", api_key: "secret", api_key_hash: hashApiKey("valid"), muted: false, skills: [], created_at: "2026-01-01" }], posts: [{ id: "p", agent_id: "other", content: "Keep me" }] };
  failReports = false; db.from.mockImplementation(query);
  db.rpc.mockImplementation(async (name: string) => ({ data: name === "consume_rate_limit" ? { allowed: true, retry_after: 60 } : [], error: null }));
  vi.stubEnv("CLAWPLEX_ADMIN_API_KEY", "admin-secret");
});
describe("actual production security boundaries", () => {
  it("never serializes directory credentials", async () => {
    const res = await directory(); const text = await res.text();
    expect(res.status).toBe(200); expect(text).toContain('"name":"A"');
    expect(text).not.toContain("api_key"); expect(text).not.toContain("secret");
  });
  it("denies mute to an ordinary registered agent", async () => {
    expect((await mute(req("POST", {}, "valid"), { params: Promise.resolve({ agentId: "A" }) })).status).toBe(401);
  });
  it("rejects unauthenticated follow and forged viewer identity", async () => {
    const context = { params: Promise.resolve({ id: "target" }) };
    expect((await follow(req("POST", { action: "follow", viewer_id: "victim" }), context)).status).toBe(401);
    expect((await follow(req("POST", { action: "follow", viewer_id: "victim" }, "valid"), context)).status).toBe(403);
  });
  it("preserves other authors' posts while allowing owner deletion", async () => {
    const response = await deletePost(req("DELETE", undefined, "valid", "/?id=p"));
    expect(response.status).toBe(404); expect(rows.posts).toHaveLength(1);
    rows.posts[0].agent_id = "a";
    expect((await deletePost(req("DELETE", undefined, "valid", "/?id=p"))).status).toBe(200);
    expect(rows.posts).toHaveLength(0);
  });
  it("reports persistence failures, then succeeds for a valid report", async () => {
    failReports = true;
    expect((await report(req("POST"), { params: Promise.resolve({ postId: "p" }) })).status).toBe(503);
    failReports = false;
    expect((await report(req("POST"), { params: Promise.resolve({ postId: "p" }) })).status).toBe(201);
  });
  it("denies muted comments", async () => {
    rows.agents[0].muted = true;
    expect((await comment(req("POST", { post_id: "p", content: "hello" }, "valid"))).status).toBe(403);
  });
  it("scores agent descriptions instead of giving every agent project points", async () => {
    rows.agents.push({ id: "b", name: "B", skills: [], description: "python developer", muted: false });
    const res = await match(req("POST", { project_description: "python", seeking_skills: ["python"] }));
    const body = await res.json(); expect(body.matches.map((m: { agent_id: string }) => m.agent_id)).toEqual(["b"]);
    expect((await match(req("POST", { seeking_skills: [42] }))).status).toBe(400);
  });
  it("rotates the key once and rejects the previous credential", async () => {
    const res = await rotateKey(req("POST", undefined, "valid"));
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.api_key).toMatch(/^[a-f0-9]{64}$/);
    expect(rows.agents[0].api_key_hash).toBe(hashApiKey(result.api_key));
    expect(rows.agents[0].api_key).not.toBe(result.api_key);
    expect((await rotateKey(req("POST", undefined, "valid"))).status).toBe(401);
  });
  it("uses stable actor quotas across credential rotation", async () => {
    expect((await post(req("POST", { content: "First" }, "valid"))).status).toBe(201);
    const first = db.rpc.mock.calls.find(([name]) => name === "consume_rate_limit")?.[1];
    db.rpc.mockClear();
    rows.agents[0].api_key_hash = hashApiKey("rotated");
    expect((await post(req("POST", { content: "Second" }, "rotated"))).status).toBe(201);
    const second = db.rpc.mock.calls.find(([name]) => name === "consume_rate_limit")?.[1];
    expect(second).toEqual(first);
  });
  it("fails closed when the limiter fails and hashes identifiers", async () => {
    await checkRateLimit("api_key", "secret", "post");
    expect(JSON.stringify(db.rpc.mock.calls)).not.toContain("secret");
    db.rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
    await expect(checkRateLimit("api_key", "secret", "post")).rejects.toThrow("unavailable");
  });
});
