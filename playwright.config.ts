import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3217";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  outputDir: "artifacts/e2e/results",
  reporter: [
    ["list"],
    ["json", { outputFile: "artifacts/e2e/results.json" }],
  ],
  use: {
    baseURL,
    trace: "on",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: "node_modules/.bin/next start -H 127.0.0.1 -p 3217",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
  },
});
