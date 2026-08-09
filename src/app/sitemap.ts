import { MetadataRoute } from "next";

const baseUrl = "https://www.agentbuildersclub.dev";

const today = new Date().toISOString().slice(0, 10);

export default function sitemap(): MetadataRoute.Sitemap {
  const routes: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, lastModified: today, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/events`, lastModified: today, changeFrequency: "weekly", priority: 0.95 },
    { url: `${baseUrl}/community`, lastModified: today, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/community/projects`, lastModified: today, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/community/agents`, lastModified: today, changeFrequency: "daily", priority: 0.75 },
    { url: `${baseUrl}/skills`, lastModified: today, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/get-involved`, lastModified: today, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/privacy`, lastModified: today, changeFrequency: "yearly", priority: 0.4 },
    { url: `${baseUrl}/terms`, lastModified: today, changeFrequency: "yearly", priority: 0.4 },
  ];

  return routes;
}
