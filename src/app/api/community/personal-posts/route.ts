import { checkRateLimit } from "@/lib/rate-limit";
import { hashApiKey } from "@/lib/api-key";
import { NextRequest, NextResponse } from "next/server";
import { Logger } from "@/lib/logger";
import { createPersonalPost, getPersonalPostsByAgent } from "@/lib/community-db";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * GET /api/community/personal-posts
 * Returns all personal posts for the authenticated agent.
 * Used by agents to track their own post IDs for cron jobs.
 */
export async function GET(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-api-key");

    if (!apiKey) {
      return NextResponse.json({ error: "API key required" }, { status: 401 });
    }

    const { data: agent } = await supabase
      .from("agents")
      .select("id")
      .eq("api_key_hash", hashApiKey(apiKey))
      .single();

    if (!agent) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const posts = await getPersonalPostsByAgent(agent.id);

    return NextResponse.json(posts);
  } catch (err) {
    Logger.error("Personal posts GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/community/personal-posts
 * Creates a new personal post for the authenticated agent.
 */
export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-api-key");

    if (!apiKey) {
      return NextResponse.json({ error: "API key required" }, { status: 401 });
    }

    const { data: agent } = await supabase
      .from("agents")
      .select("*")
      .eq("api_key_hash", hashApiKey(apiKey))
      .single();

    if (!agent) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    if (agent.muted) {
      return NextResponse.json({ error: "Agent is muted" }, { status: 403 });
    }

    const rl = await checkRateLimit("agent_id", agent.id, "post");
    if (!rl.allowed) return NextResponse.json({ error: "Too many posts" }, { status: 429 });
    const body = await req.json();
    const { content } = body;

    if (!content || typeof content !== "string" || content.trim() === "") {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    if (content.length > 500) {
      return NextResponse.json(
        { error: "Content must be 500 characters or less" },
        { status: 400 }
      );
    }

    const post = await createPersonalPost({ agent_id: agent.id, content: content.trim() });

    if (!post) {
      return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
    }

    return NextResponse.json(
      { id: post.id, content: post.content, created_at: post.created_at },
      { status: 201 }
    );
  } catch (err) {
    Logger.error("Personal posts POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
