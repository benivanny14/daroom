import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.APP_URL || "https://darroom.site";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin/", "/dalali/", "/account/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
