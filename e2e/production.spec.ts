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
  const redirect = await request.get("/events", { headers: { host: "clawplex.dev" }, maxRedirects: 0 });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe("https://agentbuildersclub.dev/events");
});
