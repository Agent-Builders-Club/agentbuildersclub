import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No ISR, R2, paid image binding, or paid cache dependency. Live community
// reads use D1 at request time; static public assets are deployed separately.
export default defineCloudflareConfig({
  incrementalCache: "dummy",
  tagCache: "dummy",
  queue: "dummy",
  routePreloadingBehavior: "none",
});
