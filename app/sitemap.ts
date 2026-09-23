import type { MetadataRoute } from "next";

// Every real page in this app requires login, so a normal sitemap
// (meant to help crawlers find content) doesn't really apply here —
// combined with robots.ts disallowing everything, this is mostly just
// present because it's a standard file to have. Lists only the root.
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
    },
  ];
}
