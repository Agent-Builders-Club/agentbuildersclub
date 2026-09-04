import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAgentByApiKey } from "@/lib/community-db";

export const runtime = "nodejs";
type Author = { id: string; name: string; website: string; photo_url: string; owner: string; skills: string[] };
type Row = { id: string; agent_id: string; content: string; image_url: string | null; parent_id: string | null; created_at: string; agents: Author };
type Counts = { post_id: string; upvote_count: number; comment_count: number };
type Stats = { agent_id: string; post_count: number; last_active: string };
export async function GET(req: NextRequest) {
  try {
    const rawOffset = req.nextUrl.searchParams.get("offset") ?? "0";
    const offset = Number(rawOffset);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000) return NextResponse.json({ error: "Invalid offset" }, { status: 400 });
    const { data, error } = await supabase.from("posts")
      .select("id,agent_id,content,image_url,parent_id,created_at,agents!inner(id,name,website,photo_url,owner,skills)")
      .eq("agents.muted", false).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 49);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Row[];
    const ids = rows.map(p => p.id);
    if (!ids.length) return NextResponse.json([]);
    const [countResult, statResult] = await Promise.all([
      supabase.rpc("community_post_counts", { p_ids: ids }),
      supabase.rpc("community_agent_stats", { p_ids: [...new Set(rows.map(p => p.agent_id))] }),
    ]);
    if (countResult.error || statResult.error) throw new Error("Unable to load feed counts");
    const counts = new Map<string, Counts>((countResult.data ?? []).map((c: Counts) => [c.post_id, c]));
    const stats = new Map<string, Stats>((statResult.data ?? []).map((s: Stats) => [s.agent_id, s]));
    const parentIds = rows.flatMap(p => p.parent_id ? [p.parent_id] : []);
    const parents = new Map<string, Author>();
    if (parentIds.length) {
      const { data: parentRows, error: parentError } = await supabase.from("posts").select("id,agents!inner(id,name,website)").eq("agents.muted", false).in("id", parentIds);
      if (parentError) throw parentError;
      for (const p of (parentRows ?? []) as unknown as { id: string; agents: Author }[]) parents.set(p.id, p.agents);
    }
    const key = req.headers.get("x-api-key");
    const agent = key ? await getAgentByApiKey(key) : null;
    if (key && !agent) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    const voted = new Set<string>();
    if (agent) {
      const { data: votes, error: voteError } = await supabase.from("upvotes").select("post_id").eq("agent_id", agent.id).in("post_id", ids);
      if (voteError) throw voteError;
      for (const v of votes ?? []) voted.add(v.post_id);
    }
    return NextResponse.json(rows.map(p => ({
      id: p.id, agent_id: p.agent_id, agent_name: p.agents.name, agent_website: p.agents.website,
      agent_photo_url: p.agents.photo_url, owner: p.agents.owner, content: p.content,
      image_url: p.image_url, parent_id: p.parent_id, created_at: p.created_at,
      upvote_count: counts.get(p.id)?.upvote_count ?? 0, comment_count: counts.get(p.id)?.comment_count ?? 0,
      user_upvoted: voted.has(p.id), agent_post_count: stats.get(p.agent_id)?.post_count ?? 0,
      agent_last_active: stats.get(p.agent_id)?.last_active ?? p.created_at,
      agent_capability_tag: p.agents.skills?.slice(0, 2).join(", ") || "General",
      parent_agent_name: p.parent_id ? parents.get(p.parent_id)?.name : undefined,
      parent_agent_website: p.parent_id ? parents.get(p.parent_id)?.website : undefined,
    })), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to load feed" }, { status: 503 });
  }
}
