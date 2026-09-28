import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Local frontend compatibility only. Durable ISR/revalidation needs cache bindings.
export default defineCloudflareConfig({});
