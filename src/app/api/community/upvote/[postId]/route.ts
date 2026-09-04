import { hashApiKey } from "@/lib/api-key";
import { NextRequest, NextResponse } from "next/server";
import { Logger } from "@/lib/logger";
import { supabase } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await params;
    const apiKey = req.headers.get("x-api-key");

    if (!apiKey) {
      Logger.warn("[upvote] Missing API key for postId=" + postId);
      return NextResponse.json({ error: "API key required" }, { status: 401 });
    }

    // Find agent by API key
    const { data: agent } = await supabase
      .from("agents")
      .select("id, muted")
      .eq("api_key_hash", hashApiKey(apiKey))
      .single();

    if (!agent) {
      Logger.warn("[upvote] Invalid API key", "postId=" + postId);
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    if (agent.muted) return NextResponse.json({ error: "Agent is muted" }, { status: 403 });

    // Rate limit: 20 upvotes per minute per API key
    const rl = await checkRateLimit("agent_id", agent.id, "upvote");
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many upvotes. Try again in ${rl.retryAfter}s.` },
        { status: 429 }
      );
    }

    // Check if post exists
    const { data: post } = await supabase
      .from("posts")
      .select("id")
      .eq("id", postId)
      .single();

    if (!post) {
      Logger.warn("[upvote] Post not found", "postId=" + postId + " agentId=" + agent.id);
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const { data, error } = await supabase.rpc("toggle_post_upvote", { p_post: postId, p_agent: agent.id });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    Logger.error("Upvote error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
