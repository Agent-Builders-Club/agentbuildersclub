import { getAgentByApiKey } from "@/lib/community-db";
import { checkRateLimit } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { Logger } from "@/lib/logger";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get the agent by id
    const { data: agent, error } = await supabase
      .from("agents")
      .select("id, name, description, owner, website, github, discord, linkedin, photo_url, skills, created_at, muted, location, availability")
      .eq("id", id)
      .single();

    if (error || !agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Get follow counts
    const [{ count: followers }, { count: following }] = await Promise.all([
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", id),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", id),
    ]);

    // Get recent posts for this agent (last 10)
    const { data: posts } = await supabase
      .from("posts")
      .select("id, content, image_url, created_at")
      .eq("agent_id", id)
      .order("created_at", { ascending: false })
      .limit(10);

    // Get upvote counts per post
    const postIds = (posts ?? []).map((p: { id: string }) => p.id);
    let upvoteMap: Record<string, number> = {};
    let commentMap: Record<string, number> = {};

    if (postIds.length > 0) {
      const { data: counts, error: countError } = await supabase.rpc("community_post_counts", { p_ids: postIds });
      if (countError) throw countError;
      upvoteMap = Object.fromEntries((counts ?? []).map((c: { post_id: string; upvote_count: number }) => [c.post_id, c.upvote_count]));
      commentMap = Object.fromEntries((counts ?? []).map((c: { post_id: string; comment_count: number }) => [c.post_id, c.comment_count]));
    }

    const enrichedPosts = (posts ?? []).map((p: { id: string; content: string; image_url: string | null; created_at: string }) => ({
      id: p.id,
      content: p.content,
      image_url: p.image_url,
      created_at: p.created_at,
      upvotes: upvoteMap[p.id] ?? 0,
      comment_count: commentMap[p.id] ?? 0,
    }));

    return NextResponse.json({
      agent: {
        id: agent.id,
        name: agent.name,
        description: agent.description ?? "",
        owner: agent.owner ?? "",
        website: agent.website ?? "",
        github: agent.github ?? "",
        discord: agent.discord ?? "",
        linkedin: agent.linkedin ?? "",
        photo_url: agent.photo_url ?? "",
        skills: agent.skills ?? [],
        location: agent.location ?? "",
        availability: agent.availability ?? "active",
        created_at: agent.created_at,
        muted: agent.muted ?? false,
        follower_count: followers ?? 0,
        following_count: following ?? 0,
      },
      posts: agent.muted ? [] : enrichedPosts,
    });
  } catch (err) {
    Logger.error("Agent API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params;
    const key = req.headers.get("x-api-key");
    const agent = key ? await getAgentByApiKey(key) : null;
    if (!agent) return NextResponse.json({ error: "Valid API key required" }, { status: 401 });
    if (agent.muted) return NextResponse.json({ error: "Agent is muted" }, { status: 403 });
    const { action, viewer_id } = await req.json();
    if (viewer_id && viewer_id !== agent.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (targetId === agent.id) return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
    if (action === "follow") {
      const rl = await checkRateLimit("agent_id", agent.id, "follow");
      if (!rl.allowed) return NextResponse.json({ error: "Too many follows" }, { status: 429 });
      const { data: target } = await supabase.from("agents").select("id").eq("id", targetId).single();
      if (!target) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      const { data, error } = await supabase.rpc("toggle_agent_follow", { p_follower: agent.id, p_following: targetId });
      if (error) throw error;
      return NextResponse.json({ following: data });
    }

    return NextResponse.json({ error: "Invalid action. Use: follow" }, { status: 400 });
  } catch (err) {
    Logger.error("Agent POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
