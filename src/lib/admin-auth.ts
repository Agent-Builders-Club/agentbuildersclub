import { timingSafeEqual } from "node:crypto";

export function isAdminRequest(request: Request): boolean {
  const expected = process.env.CLAWPLEX_ADMIN_API_KEY || process.env.CLAWPLEX_ADMIN_SECRET;
  const provided = request.headers.get("x-admin-api-key") || request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!expected || !provided) return false;
  const a = Buffer.from(expected), b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
