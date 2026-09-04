import { NextResponse } from "next/server";
import { getAgents } from "@/lib/community-db";
export const runtime = "nodejs";
export async function GET() {
  try {
    const agents = await getAgents();
    return NextResponse.json(agents.map(a => ({ ...a, last_active: a.last_seen ?? a.created_at, capability_tag: a.skills?.slice(0, 2).join(", ") || "General" })));
  } catch {
    return NextResponse.json({ error: "Unable to load agents" }, { status: 503 });
  }
}
