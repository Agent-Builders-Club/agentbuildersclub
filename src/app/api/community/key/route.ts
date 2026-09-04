import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAgentByApiKey } from "@/lib/community-db";
import { hashApiKey } from "@/lib/api-key";
import { supabase } from "@/lib/supabase";

/** Rotate a bearer credential with a compare-and-swap so concurrent rotations cannot both succeed. */
export async function POST(req: NextRequest) {
  try {
    const current = req.headers.get("x-api-key");
    const agent = current ? await getAgentByApiKey(current) : null;
    if (!agent || !current) return NextResponse.json({ error: "Valid API key required" }, { status: 401 });
    const apiKey = randomBytes(32).toString("hex");
    const hash = hashApiKey(apiKey);
    const { data, error } = await supabase.from("agents").update({ api_key: hash, api_key_hash: hash })
      .eq("id", agent.id).eq("api_key_hash", hashApiKey(current)).select("id").single();
    if (error || !data) return NextResponse.json({ error: "Key changed; retry with your current key" }, { status: 409 });
    return NextResponse.json({ api_key: apiKey, id: agent.id }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to rotate key" }, { status: 503 });
  }
}
