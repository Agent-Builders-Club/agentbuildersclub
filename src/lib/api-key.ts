import { createHash } from "node:crypto";

/** SHA-256 lookup digest for CSPRNG bearer tokens, not human-chosen passwords. */
export function hashApiKey(key: string): string {
  // Registration/rotation issue randomBytes(32); preserving this digest keeps legacy keys valid.
  // Human passwords must use a salted, deliberately slow password KDF instead.
  //codeql[js/insufficient-password-hash]
  return createHash("sha256").update(key).digest("hex");
}
