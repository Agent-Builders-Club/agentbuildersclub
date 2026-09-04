import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkRateLimit, getClientIP } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const { email, name, message } = await request.json();
    if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        typeof name !== "string" || !name.trim() || name.length > 100 ||
        typeof message !== "string" || !message.trim() || message.length > 5000) {
      return NextResponse.json({ error: "Provide a valid email, name (1–100 characters), and message (1–5000 characters)" }, { status: 400 });
    }
    const rl = await checkRateLimit("ip", getClientIP(request), "contact");
    if (!rl.allowed) return NextResponse.json({ error: "Too many messages" }, { status: 429 });
    const { error } = await supabase.from("contact_messages").insert({ email: email.trim().toLowerCase(), name: name.trim(), message: message.trim() });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to save message" }, { status: 503 });
  }
}
