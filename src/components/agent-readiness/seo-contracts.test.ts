import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { eventSchema, homepageSchema } from "./json-ld-schemas";

describe("SEO contracts", () => {
  it("allows answer engines while keeping API routes out of the crawl", () => {
    const rules = robots().rules;
    expect(rules).toEqual([{ userAgent: "*", allow: "/", disallow: ["/api/"] }]);
    expect(robots().sitemap).toBe("https://www.agentbuildersclub.dev/sitemap.xml");
  });

  it("publishes only canonical public routes in the sitemap", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain("https://www.agentbuildersclub.dev/community/agents");
    expect(urls).toContain("https://www.agentbuildersclub.dev/get-involved");
    expect(urls).not.toContain("https://www.agentbuildersclub.dev/work-with-us");
    expect(urls.every((url) => url.startsWith("https://www.agentbuildersclub.dev/"))).toBe(true);
  });

  it("uses the canonical organization identity and valid event status URLs", () => {
    expect(homepageSchema().sameAs).toContain("https://github.com/Agent-Builders-Club/agentbuildersclub");
    expect(eventSchema({
      name: "Test Node",
      startDate: "2026-08-20T18:00:00-05:00",
      endDate: "2026-08-20T20:00:00-05:00",
      location: "DFW",
      description: "A builder meetup.",
      status: "scheduled",
    }).eventStatus).toBe("https://schema.org/EventScheduled");
  });
});