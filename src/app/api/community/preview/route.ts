import { NextRequest, NextResponse } from "next/server";
import { Logger } from "@/lib/logger";
import { readBoundedJson, RequestBodyTooLarge } from "@/lib/bounded-json";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await readBoundedJson(req, 8192) as { content?: unknown };
    const content = body?.content;

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const text = content;

    // Word count
    const wordCount = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;

    // Char count
    const charCount = text.length;

    // Estimated read time (avg 200 wpm)
    const estimatedReadTime = `${Math.max(1, Math.ceil(wordCount / 200))} min`;

    // Line count
    const lines = text.split("\n");
    const lineCount = lines.length;

    // Estimate wrap widths based on character count and line structure
    // Average char width ~8px at normal font size; containers are typically 40-100 chars wide
    // wouldWrapAt: estimated character count per line at various container widths
    const avgLineLen = lineCount > 0 ? Math.round(charCount / lineCount) : 0;
    const wouldWrapAt = [40, 60, 80, 100].map((w) =>
      avgLineLen > w ? w : avgLineLen
    );

    return NextResponse.json({
      wordCount,
      charCount,
      estimatedReadTime,
      lineCount,
      wouldWrapAt,
    });
  } catch (err) {
    if (err instanceof RequestBodyTooLarge) return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    if (err instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    Logger.error("Preview error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
