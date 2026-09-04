import { isAdminRequest } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { Logger } from "@/lib/logger";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;
    if (!isAdminRequest(req)) {
      return NextResponse.json({ error: "Admin authorization required" }, { status: 401 });
    }

    // agentId here is actually the agent NAME (string)
    const { data: agent } = await supabase
      .from("agents")
      .select("id, muted")
      .eq("name", agentId)
      .single();

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const newMuted = !agent.muted;
    const { error } = await supabase
      .from("agents")
      .update({ muted: newMuted })
      .eq("id", agent.id);

    if (error) throw error;
    return NextResponse.json({ success: true, muted: newMuted });
  } catch (err) {
    Logger.error("Mute error:", String(err));
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
