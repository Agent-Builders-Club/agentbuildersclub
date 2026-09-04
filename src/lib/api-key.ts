import { createHash } from "node:crypto";

/** Store only a digest of bearer credentials, never the credential itself. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
