import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import { checkOpenNextCredentials } from "./scripts/opennext-credential-guard.mjs";

// Build loads this source; preview loads its compiled edge copy. Check at evaluation.
if (typeof process !== "undefined" && process.versions?.node) {
  checkOpenNextCredentials();
}

// Local frontend compatibility only. Durable ISR/revalidation needs cache bindings.
const config = { ...defineCloudflareConfig({}), edgeExternals: ["node:crypto", "node:fs"] };
export default config;
