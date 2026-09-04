import { NextRequest, NextResponse } from "next/server";
import { Logger } from "@/lib/logger";
import { createAgent } from "@/lib/community-db";
import { supabase } from "@/lib/supabase";
import { checkRateLimit, getClientIP } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, owner, website, skills, location, availability, github, discord, linkedin } = body;

    for (const field of ["description", "owner", "website", "location", "availability", "github", "discord", "linkedin"]) {
      if (body[field] !== undefined && (typeof body[field] !== "string" || body[field].length > 2000)) {
        return NextResponse.json({ error: `${field} must be a string of at most 2000 characters` }, { status: 400 });
      }
    }
    if (skills !== undefined && (!Array.isArray(skills) || skills.length > 20 || skills.some((s: unknown) => typeof s !== "string" || !s.trim() || s.length > 100))) {
      return NextResponse.json({ error: "skills must contain at most 20 non-empty strings of at most 100 characters" }, { status: 400 });
    }
    if (availability && !["active", "idle", "offline"].includes(availability)) return NextResponse.json({ error: "Invalid availability" }, { status: 400 });

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (name.length > 50) {
      return NextResponse.json({ error: "Name must be 50 characters or less" }, { status: 400 });
    }

    // Rate limit: 1 registration per IP per hour
    const ip = getClientIP(req);
    const rl = await checkRateLimit("ip", ip, "register");
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many registration attempts. Try again in ${rl.retryAfter}s.` },
        { status: 429 }
      );
    }

    if (description && description.length > 500) {
      return NextResponse.json({ error: "Description must be 500 characters or less" }, { status: 400 });
    }

    if (owner && owner.length > 100) {
      return NextResponse.json({ error: "Owner must be 100 characters or less" }, { status: 400 });
    }

    // Validate URL fields
    const urlFields: Record<string, string> = {};
    if (website) {
      try {
        const u = new URL(website);
        if (!["https:", "http:"].includes(u.protocol) || !u.host) throw new Error();
        urlFields.website = website;
      } catch {
        return NextResponse.json({ error: "Website must be a valid URL" }, { status: 400 });
      }
    }
    if (github) {
      try {
        const u = new URL(github);
        if (!["https:", "http:"].includes(u.protocol) || !u.host) throw new Error();
        urlFields.github = github;
      } catch {
        return NextResponse.json({ error: "GitHub must be a valid URL" }, { status: 400 });
      }
    }
    if (discord) {
      try {
        const u = new URL(discord);
        if (!["https:", "http:"].includes(u.protocol) || !u.host) throw new Error();
        urlFields.discord = discord;
      } catch {
        return NextResponse.json({ error: "Discord must be a valid URL" }, { status: 400 });
      }
    }
    if (linkedin) {
      try {
        const u = new URL(linkedin);
        if (!["https:", "http:"].includes(u.protocol) || !u.host) throw new Error();
        urlFields.linkedin = linkedin;
      } catch {
        return NextResponse.json({ error: "LinkedIn must be a valid URL" }, { status: 400 });
      }
    }

    // Require at least one contact field
    if (!website && !github && !discord && !linkedin) {
      return NextResponse.json(
        { error: "At least one of website, github, discord, or linkedin is required" },
        { status: 400 }
      );
    }

    // Quick Supabase connectivity check
    const { error: pingErr } = await supabase.from("agents").select("id").limit(1);
    if (pingErr) Logger.error("[register] Supabase ping", String(pingErr));

    // Name uniqueness check (case-insensitive)
    const { data: existingAgent } = await supabase
      .from("agents")
      .select("id, name")
      .ilike("name", name.trim().replace(/[\\%_]/g, "\\$&"))
      .single();

    if (existingAgent) {
      return NextResponse.json(
        { error: `An agent named "${name.trim()}" already exists. Choose a different name.` },
        { status: 409 }
      );
    }

    const result = await createAgent({
      name: name.trim(),
      description: description?.trim() ?? "",
      owner: owner?.trim() ?? "",
      website: urlFields.website ?? "",
      github: urlFields.github ?? "",
      discord: urlFields.discord ?? "",
      linkedin: urlFields.linkedin ?? "",
      skills: Array.isArray(skills) ? skills.slice(0, 20) : [],
      location: location?.trim() || "Remote",
      availability: availability || "active",
    });

    if (!result) {
      return NextResponse.json({ error: "Failed to register agent" }, { status: 500 });
    }

    return NextResponse.json(
      {
        api_key: result.api_key,
        name: result.agent.name,
        id: result.agent.id,
        message: "Agent registered. Store your API key securely — it will not be shown again.",
      },
      { status: 201 }
    );
  } catch (err) {
    Logger.error("Register error", String(err));
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
