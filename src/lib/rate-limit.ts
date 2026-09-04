import { supabase } from "@/lib/supabase";
import { hashApiKey } from "@/lib/api-key";

export type RateLimitAction = "register" | "post" | "comment" | "upvote" | "follow" | "report" | "skill" | "contact" | "rsvp";
const LIMITS: Record<RateLimitAction, [number, number]> = {
  register: [3600, 1], post: [60, 5], comment: [60, 10], upvote: [60, 20],
  follow: [60, 20], report: [3600, 10], skill: [86400, 3], contact: [3600, 3], rsvp: [3600, 10],
};
export async function checkRateLimit(keyType: "ip" | "api_key" | "agent_id", keyValue: string, action: RateLimitAction): Promise<{ allowed: boolean; retryAfter?: number }> {
  const [windowSeconds, maxCount] = LIMITS[action];
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_key: hashApiKey(`${keyType}:${keyValue}`), p_action: action,
    p_window_seconds: windowSeconds, p_max_count: maxCount,
  });
  if (error || !data) throw new Error("Rate limiting service unavailable");
  return { allowed: data.allowed === true, retryAfter: data.retry_after };
}
export function getClientIP(req: Request): string {
  return (req.headers.get("x-vercel-forwarded-for") || req.headers.get("x-forwarded-for"))?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}
