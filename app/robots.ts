import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.APP_URL || "https://darroom.site";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Prefix matching covers every child path; the bare paths are listed too
      // because `/dalali` and `/account` are not under a trailing slash.
      disallow: ["/api/", "/admin", "/dalali", "/account"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
