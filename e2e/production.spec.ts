import { expect, test } from "@playwright/test";

// Browser-only fixture: the production server still serves HTML/JS. No API request
// reaches Supabase; unexpected APIs fail the test instead of silently going live.
const unexpectedApis = new WeakMap<object, string[]>();
test.beforeEach(async ({ page }) => {
  const unexpected: string[] = [];
  unexpectedApis.set(page, unexpected);
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:3217(?:\/|$)).*/, (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/skills") {
      await route.fulfill({ json: [
        { id: "research-1", name: "Atlas Research", description: "Find source documents", category: "Research", trigger_phrases: ["research this"], instructions: "Gather sources.", submitter_name: "Fixture", install_count: 1, created_at: "2026-01-01T00:00:00Z" },
        { id: "creative-1", name: "Canvas Maker", description: "Generate a visual", category: "Creative", trigger_phrases: [], instructions: "Draw carefully.", submitter_name: "Fixture", install_count: 2, created_at: "2026-01-01T00:00:00Z" },
      ] });
    } else {
      unexpected.push(route.request().url());
      await route.abort();
    }
  });
  // A Luma HTML stub proves the first-party iframe contract without asserting a
  // third-party calendar's contents, availability or cross-origin state.
  await page.route("https://luma.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>External calendar stub</title>" }));
});

test.afterEach(async ({ page }) => {
  expect(unexpectedApis.get(page), "unexpected API request (blocked before reaching server)").toEqual([]);
});

test("home navigation and keyboard skip target", async ({ page }, testInfo) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main-content$/);
  await expect(page.locator("#main-content")).toHaveCount(1);
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
    await page.locator("#mobile-navigation").getByRole("link", { name: "Events" }).click();
  } else {
    await page.locator("nav").getByRole("link", { name: "Events" }).click();
  }
  await expect(page).toHaveURL(/\/events$/);
  await expect(page.getByRole("heading", { name: "Events", exact: true, level: 1 })).toBeVisible();
  const image = testInfo.outputPath("events.png");
  await page.screenshot({ path: image, animations: "disabled" });
  await testInfo.attach("events", { path: image, contentType: "image/png" });
});

test("events expose an external calendar iframe boundary", async ({ page }) => {
  await page.goto("/events");
  const calendar = page.locator('iframe[title="Agent Builders Club Events"]');
  await expect(calendar).toHaveAttribute("src", "https://luma.com/embed/calendar/cal-AzkmUYVr0KtSTQ9/events");
  await expect(calendar).toBeVisible();
});

test("skills fixture drives search, category filter and detail dialog", async ({ page }, testInfo) => {
  await page.goto("/skills");
  await expect(page.getByRole("heading", { name: "Atlas Research" })).toBeVisible();
  await page.getByPlaceholder("Search skills...").fill("source documents");
  await expect(page.getByRole("heading", { name: "Canvas Maker" })).toHaveCount(0);
  await page.getByPlaceholder("Search skills...").clear();
  await page.getByRole("button", { name: "Creative", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Canvas Maker" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Atlas Research" })).toHaveCount(0);
  await page.getByRole("heading", { name: "Canvas Maker" }).click();
  await expect(page.getByText("Draw carefully.")).toBeVisible();
  const image = testInfo.outputPath("skills-dialog.png");
  await page.screenshot({ path: image, animations: "disabled" });
  await testInfo.attach("skills-dialog", { path: image, contentType: "image/png" });
  await page.getByRole("button", { name: "Close skill details" }).click();
  await expect(page.getByText("Draw carefully.")).toHaveCount(0);
});

test("preview rejects oversized bodies and preserves valid envelope", async ({ request }) => {
  const oversized = JSON.stringify({ content: "x".repeat(9000) });
  const response = await request.post("/api/community/preview", {
    data: oversized,
    headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(oversized)) },
  });
  expect(response.status()).toBe(413);
  expect(await response.json()).toEqual({ error: "Request body too large" });
  // No Content-Length: the route must count the actual streamed bytes.
  const streamed = await fetch("http://127.0.0.1:3217/api/community/preview", {
    method: "POST", headers: { "content-type": "application/json" },
    body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(oversized)); controller.close(); } }),
    duplex: "half", signal: AbortSignal.timeout(10000),
  } as RequestInit & { duplex: "half" });
  expect(streamed.status).toBe(413);
  expect(await streamed.json()).toEqual({ error: "Request body too large" });
  const valid = await request.post("/api/community/preview", { data: { content: "one two" } });
  expect(valid.status()).toBe(200);
  expect(await valid.json()).toMatchObject({ wordCount: 2, charCount: 7 });
  const malformed = await request.post("/api/community/preview", { data: Buffer.from("{"), headers: { "content-type": "application/json" } });
  expect(malformed.status()).toBe(400);
  expect(await malformed.json()).toEqual({ error: "Invalid JSON" });
});

test("match rejects oversized JSON before database access", async ({ request }) => {
  const response = await request.post("/api/agents/match", {
    data: JSON.stringify({ seeking_skills: ["typescript"], padding: "x".repeat(9000) }),
    headers: { "content-type": "application/json" },
  });
  expect(response.status()).toBe(413);
  expect(await response.json()).toEqual({ error: "Request body too large" });
});

test("production SEO endpoints, missing page and legacy host redirect", async ({ page, request }) => {
  const home = await page.goto("/");
  expect(home?.headers()["x-content-type-options"]).toBe("nosniff");
  await expect(page).toHaveTitle(/Agent Builders Club/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://www.agentbuildersclub.dev");
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain("Disallow: /api/");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain("https://www.agentbuildersclub.dev/events");
  const missing = await page.goto("/page-does-not-exist-e2e");
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Not Found" })).toBeVisible();
  for (const host of ["clawplex.dev", "www.clawplex.dev"]) {
    const redirect = await request.get("/events?from=old&topic=agents", { headers: { host }, maxRedirects: 0 });
    expect(redirect.status()).toBe(308);
    expect(redirect.headers().location).toBe("https://agentbuildersclub.dev/events?from=old&topic=agents");
  }
  for (const path of ["/sponsors", "/work-with-us"]) {
    const redirect = await request.get(path, { maxRedirects: 0 });
    expect(redirect.status()).toBe(308);
    expect(redirect.headers().location).toBe("/get-involved");
  }
  const localImage = await request.get("/_next/image?url=%2Fabc-logo.jpg&w=96&q=75");
  expect(localImage.status()).toBe(200);
  expect(localImage.headers()["content-type"]).toMatch(/^image\//);
  expect((await localImage.body()).length).toBeGreaterThan(100);
  expect(localImage.headers()["x-content-type-options"]).toBe("nosniff");
});
