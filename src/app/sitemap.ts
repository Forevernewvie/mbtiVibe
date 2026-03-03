import type { MetadataRoute } from "next";

const routes = ["", "/assessment", "/dashboard", "/contact", "/terms", "/privacy", "/refund"];

/**
 * Generates sitemap entries for crawlable routes.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL ?? "http://localhost:3000";

  return routes.map((route) => ({
    url: `${base}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" ? 1 : 0.7,
  }));
}
