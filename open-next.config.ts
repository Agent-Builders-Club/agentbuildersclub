import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Read-only build-time prerenders use the existing ASSETS binding. No ISR,
// R2/KV/DO, paid image binding, tag invalidation or revalidation queue.
// Interception runs after adapter routing/middleware; dynamic D1/auth stays SSR.
const config = defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
  tagCache: "dummy",
  queue: "dummy",
  routePreloadingBehavior: "none",
});
// Only the private cache prefix is worker-first. The adapter's default asset
// resolver would re-expose those files via ASSETS; use its built-in no-op.
// Public assets remain asset-first; the incremental cache still reads ASSETS.
config.middleware!.assetResolver = "dummy";
export default config;
