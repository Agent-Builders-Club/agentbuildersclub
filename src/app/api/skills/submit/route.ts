import { NextResponse } from "next/server";
import { Logger } from "@/lib/logger";
import { supabase } from "@/lib/supabase";

// In-memory rate limit store: apiKey -> { count, resetAt }
const rateLimitStore = new Map<
  string,
  { count: number; resetAt: number }
>();

const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours


function checkRateLimit(apiKey: string): { allowed: boolean; reason?: string } {
  const now = Date.now();
  const entry = rateLimitStore.get(apiKey);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(apiKey, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= RATE_LIMIT) {
    const resetIn = Math.ceil((entry.resetAt - now) / 1000 / 60);
    return {
      allowed: false,
      reason: `Rate limit reached. Try again in ${resetIn} minutes.`,
    };
  }

  entry.count++;
  return { allowed: true };
}

const VALID_CATEGORIES = [
  "research",
  "productivity",
  "social",
  "utility",
  "creative",
];

interface SkillSubmission {
  name: string;
  description: string;
  category: string;
  trigger_phrases: string[];
  instructions: string;
  api_key?: string;
  agent_id?: string;
}

function validateSubmission(body: unknown): { valid: true; data: SkillSubmission } | { valid: false; error: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid request body" };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.name !== "string" || b.name.trim().length < 1 || b.name.trim().length > 100) {
    return { valid: false, error: "name must be a 1–100 character string" };
  }
  if (typeof b.description !== "string" || b.description.trim().length < 10 || b.description.trim().length > 500) {
    return { valid: false, error: "description must be a 10–500 character string" };
  }
  if (typeof b.category !== "string" || !VALID_CATEGORIES.includes(b.category)) {
    return { valid: false, error: `category must be one of: ${VALID_CATEGORIES.join(", ")}` };
  }
  if (!Array.isArray(b.trigger_phrases) || b.trigger_phrases.length < 1 || b.trigger_phrases.length > 10) {
    return { valid: false, error: "trigger_phrases must be an array of 1–10 strings" };
  }
  for (const phrase of b.trigger_phrases) {
    if (typeof phrase !== "string" || phrase.trim().length < 1) {
      return { valid: false, error: "each trigger phrase must be a non-empty string" };
    }
  }
  if (typeof b.instructions !== "string" || b.instructions.trim().length < 20 || b.instructions.trim().length > 10000) {
    return { valid: false, error: "instructions must be a 20–10000 character string" };
  }

  return {
    valid: true,
    data: {
      name: b.name.trim(),
      description: b.description.trim(),
      category: b.category,
      trigger_phrases: b.trigger_phrases.map((p: unknown) => String(p).trim()),
      instructions: b.instructions.trim(),
      api_key: typeof b.api_key === "string" ? b.api_key.trim() : undefined,
      agent_id: typeof b.agent_id === "string" ? b.agent_id.trim() : undefined,
    },
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const apiKey = (body.api_key as string | undefined) ?? "anonymous";

    // Rate limit check
    const rateCheck = checkRateLimit(apiKey);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: rateCheck.reason }, { status: 429 });
    }

    // Schema validation
    const validation = validateSubmission(body);
    if (!validation.valid) {
      return NextResponse.json({ error: (validation as { valid: false; error: string }).error }, { status: 400 });
    }

    const { data } = validation;
    const submittedBy = apiKey === "anonymous" ? "anonymous" : apiKey.slice(0, 12) + "...";

    // Store every submission as pending for human admin review.
    const { data: inserted, error: insertError } = await supabase
      .from("skills")
      .insert({
        name: data.name,
        description: data.description,
        category: data.category,
        trigger_phrases: data.trigger_phrases,
        instructions: data.instructions,
        submitted_by: submittedBy,
        agent_id: data.agent_id ?? null,
        approved: false,
        flagged: false,
      })
      .select("id")
      .single();

    if (insertError) {
      Logger.error("[skills-submit] Insert error:", insertError);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Skill submitted for human admin review. It will not be publicly listed until approved.",
        id: inserted.id,
      },
      { status: 201 }
    );
  } catch (error) {
    Logger.error("[skills-submit] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
