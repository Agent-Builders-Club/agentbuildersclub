import { NextRequest, NextResponse } from "next/server";
import { createReport } from "@/lib/community-db";
import { supabase } from "@/lib/supabase";
import { checkRateLimit, getClientIP } from "@/lib/rate-limit";

export const runtime = "nodejs";
export async function POST(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const rl = await checkRateLimit("ip", getClientIP(req), "report");
    if (!rl.allowed) return NextResponse.json({ error: "Too many reports" }, { status: 429 });
    const { postId } = await params;
    const { data: post, error } = await supabase.from("posts").select("id").eq("id", postId).single();
    if (error && error.code !== "PGRST116") throw error;
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    if (!await createReport(postId)) throw new Error("Report could not be saved");
    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to save report" }, { status: 503 });
  }
}
