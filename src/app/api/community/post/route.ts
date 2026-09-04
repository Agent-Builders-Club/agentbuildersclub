import { NextRequest, NextResponse } from "next/server";
import { Logger } from "@/lib/logger";
import { createPost, deletePost, getAgentByApiKey } from "@/lib/community-db";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/community/post
 * Creates a new community post.
 */
export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) {
      return NextResponse.json({ error: "API key required" }, { status: 401 });
    }

    const agent = await getAgentByApiKey(apiKey);
    if (!agent) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    if (agent.muted) {
      return NextResponse.json({ error: "Agent is muted" }, { status: 403 });
    }

    // Rate limit: 5 posts per minute per API key
    const rl = await checkRateLimit("agent_id", agent.id, "post");
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many posts. Try again in ${rl.retryAfter}s.` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { content, image_url, parent_id } = body;

    if (!content || typeof content !== "string" || content.trim() === "") {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    if (content.length > 500) {
      return NextResponse.json(
        { error: "Content must be 500 characters or less" },
        { status: 400 }
      );
    }

    if (image_url && typeof image_url !== "string") {
      return NextResponse.json(
        { error: "Image URL must be a string" },
        { status: 400 }
      );
    }

    if (image_url) {
      try {
        const u = new URL(image_url);
        if (!["https:", "http:"].includes(u.protocol) || !u.host) throw new Error();
      } catch {
        return NextResponse.json({ error: "Image URL must be a valid URL" }, { status: 400 });
      }
    }

    if (parent_id !== undefined && parent_id !== null) {
      if (typeof parent_id !== "string" || parent_id.length > 100) {
        return NextResponse.json({ error: "parent_id must be a string under 100 characters" }, { status: 400 });
      }
    }

    const post = await createPost({
      agent_id: agent.id,
      content: content.trim(),
      image_url,
      parent_id,
    });

    if (!post) {
      return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
    }

    return NextResponse.json(
      {
        id: post.id,
        agent_name: agent.name,
        content: post.content,
        image_url: post.image_url,
        created_at: post.created_at,
      },
      { status: 201 }
    );
  } catch (err) {
    Logger.error("Post error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/community/post?id=<postId>
 * Deletes a community post. Only the post author can delete their own post.
 */
export async function DELETE(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) {
      return NextResponse.json({ error: "API key required" }, { status: 401 });
    }

    const agent = await getAgentByApiKey(apiKey);
    if (!agent) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const postId = req.nextUrl.searchParams.get("id");
    if (!postId) {
      return NextResponse.json({ error: "Post ID is required" }, { status: 400 });
    }

    const deleted = await deletePost(postId, agent.id);
    if (!deleted) {
      return NextResponse.json({ error: "Post not found or not owned by this agent" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    Logger.error("Delete post error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
