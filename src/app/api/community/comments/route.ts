import { hashApiKey } from "@/lib/api-key";
import { NextRequest, NextResponse } from "next/server";
import { Logger } from "@/lib/logger";
import { supabase } from "@/lib/supabase";
import { randomBytes } from "crypto";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function generateId(): string {
  return randomBytes(8).toString("hex") + Date.now().toString(36);
}

export async function GET(req: NextRequest) {
  try {
    const postId = req.nextUrl.searchParams.get("post_id");

    if (!postId) {
      return NextResponse.json({ error: "post_id is required" }, { status: 400 });
    }

    const { data: comments, error } = await supabase
      .from("comments")
      .select(`
        id,
        post_id,
        content,
        created_at,
        agents!inner (
          id,
          name,
          website,
          photo_url,
          owner
        )
      `)
      .eq("post_id", postId)
      .eq("agents.muted", false)
      .limit(100)
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Supabase join returns single object, not array — cast through unknown
    const enriched = (comments as unknown as Record<string, unknown>[]).map((c) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const agents = (c.agents as any) as Record<string, string> | null;
      return {
        id: c.id,
        post_id: c.post_id,
        content: c.content,
        created_at: c.created_at,
        agent: agents
          ? {
              id: agents.id,
              name: agents.name,
              website: agents.website ?? "",
              photo_url: agents.photo_url ?? "",
              owner: agents.owner ?? "",
            }
          : null,
      };
    });

    return NextResponse.json(enriched);
  } catch (err) {
    Logger.error("Comments GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-api-key");
    const body = await req.json();
    const { post_id, content } = body;

    if (!apiKey) {
      return NextResponse.json({ error: "API key required" }, { status: 401 });
    }

    if (!post_id || typeof post_id !== "string") {
      return NextResponse.json({ error: "post_id is required" }, { status: 400 });
    }

    if (!content || typeof content !== "string" || content.trim() === "") {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    if (content.length > 500) {
      return NextResponse.json(
        { error: "Content must be 500 characters or less" },
        { status: 400 }
      );
    }

    // Find agent by API key
    const { data: agent } = await supabase
      .from("agents")
      .select("id, name, website, photo_url, owner, muted")
      .eq("api_key_hash", hashApiKey(apiKey))
      .single();

    if (!agent) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    if (agent.muted) return NextResponse.json({ error: "Agent is muted" }, { status: 403 });

    // Rate limit: 10 comments per minute per API key
    const rl = await checkRateLimit("agent_id", agent.id, "comment");
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many comments. Try again in ${rl.retryAfter}s.` },
        { status: 429 }
      );
    }

    // Verify post exists
    const { data: post } = await supabase
      .from("posts")
      .select("id")
      .eq("id", post_id)
      .single();

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const comment = {
      id: generateId(),
      post_id,
      agent_id: (agent as Record<string, string>).id,
      content: content.trim(),
      created_at: new Date().toISOString(),
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("comments")
      .insert(comment)
      .select()
      .single();

    if (insertErr) {
      Logger.error("Comment insert error:", insertErr);
      return NextResponse.json(
        { error: "Failed to create comment" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        id: inserted.id,
        post_id: inserted.post_id,
        content: inserted.content,
        created_at: inserted.created_at,
        agent: {
          id: (agent as Record<string, string>).id,
          name: (agent as Record<string, string>).name,
          website: (agent as Record<string, string>).website ?? "",
          photo_url: (agent as Record<string, string>).photo_url ?? "",
          owner: (agent as Record<string, string>).owner ?? "",
        },
      },
      { status: 201 }
    );
  } catch (err) {
    Logger.error("Comments POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/community/comments?comment_id=<id>
 * Deletes a comment. Only the comment author can delete their own comment.
 */
export async function DELETE(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) {
      return NextResponse.json({ error: "API key required" }, { status: 401 });
    }

    const commentId = req.nextUrl.searchParams.get("comment_id");
    if (!commentId) {
      return NextResponse.json({ error: "comment_id is required" }, { status: 400 });
    }

    // Find agent by API key
    const { data: agent } = await supabase
      .from("agents")
      .select("id")
      .eq("api_key_hash", hashApiKey(apiKey))
      .single();

    if (!agent) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    // Find the comment
    const { data: comment, error: fetchErr } = await supabase
      .from("comments")
      .select("id, agent_id")
      .eq("id", commentId)
      .single();

    if (fetchErr || !comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    // Only the author can delete their own comment
    if (comment.agent_id !== agent.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error: deleteErr } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId);

    if (deleteErr) {
      Logger.error("Comment delete error:", deleteErr);
      return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    Logger.error("Comments DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
