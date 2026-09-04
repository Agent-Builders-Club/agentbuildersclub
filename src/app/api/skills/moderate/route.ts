import { NextResponse } from "next/server";
import { Logger } from "@/lib/logger";
import { supabase } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-auth";

interface ModeratePayload {
  id: string;
  action: "approve" | "reject" | "flag" | "unflag";
}

function validatePayload(body: unknown): { valid: true; data: ModeratePayload } | { valid: false; error: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid request body" };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.id !== "string" || !b.id) {
    return { valid: false, error: "id is required and must be a non-empty string" };
  }
  if (!["approve", "reject", "flag", "unflag"].includes(b.action as string)) {
    return { valid: false, error: "action must be one of: approve, reject, flag, unflag" };
  }

  return { valid: true, data: { id: b.id as string, action: b.action as ModeratePayload["action"] } };
}

export async function PATCH(request: Request) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validation = validatePayload(body);
    if (!validation.valid) {
      return NextResponse.json({ error: (validation as { valid: false; error: string }).error }, { status: 400 });
    }

    const { id, action } = validation.data;
    const updates: Record<string, boolean> = {};

    switch (action) {
      case "approve":
        updates.approved = true;
        updates.flagged = false;
        break;
      case "reject":
        updates.approved = false;
        break;
      case "flag":
        updates.flagged = true;
        break;
      case "unflag":
        updates.flagged = false;
        break;
    }

    const { error: updateError } = await supabase
      .from("skills")
      .update(updates)
      .eq("id", id);

    if (updateError) {
      Logger.error("[skills-moderate] Update error:", updateError);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }

    // Check if skill still exists (update might have affected 0 rows)
    const { data: check } = await supabase
      .from("skills")
      .select("id")
      .eq("id", id)
      .single();

    if (!check) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id, action });
  } catch (error) {
    Logger.error("[skills-moderate] Unexpected error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
