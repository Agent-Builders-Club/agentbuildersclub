import { NextRequest, NextResponse } from "next/server";
import { Logger } from "@/lib/logger";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;

    if (!agentId) {
      return NextResponse.json({ error: "Agent ID required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("posts")
      .select("id, agent_id, content, image_url, created_at, parent_id, agents!inner(id)")
      .eq("agent_id", agentId)
      .eq("agents.muted", false)
      .limit(100)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json((data ?? []).map(({ agents: _agents, ...post }) => { void _agents; return post; }));
  } catch (err) {
    Logger.error("Community posts by agent error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
