import type { MetadataRoute } from "next";

// This is a private, invite-only app — every page requires login, and
// none of it should ever be crawled or indexed, so this simply blocks
// everything for every crawler.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
