import type { MetadataRoute } from "next";
import { getAreas } from "@/lib/areas";
import { notExpiredFilter } from "@/lib/listing-policy";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/site";

// Only public, indexable pages belong here. `/dalali` and `/account` are
// authenticated dashboards that redirect to the login form.
const BASE_PATHS = ["", "/rooms", "/faq", "/privacy", "/terms", "/contact"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = BASE_PATHS.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? "daily" : "weekly",
    priority: path === "" ? 1 : path === "/dalali" ? 0.8 : 0.5
  }));

  let listings: { id: string; updatedAt: Date }[] = [];
  try {
    listings = await prisma.listing.findMany({
      where: {
        status: "APPROVED",
        priceTzs: { gte: 50_000 },
        AND: [notExpiredFilter()]
      },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 5000
    });
  } catch {
    // The sitemap must still render when the database is unreachable.
  }

  let areaEntries: MetadataRoute.Sitemap = [];
  try {
    // Only areas that actually hold rooms are worth indexing; an empty area page
    // is marked noindex on the page itself.
    const areas = await getAreas();
    areaEntries = areas
      .filter((area) => area.listings > 0)
      .map((area) => ({
        url: `${SITE_URL}/rooms/${area.slug}`,
        lastModified: now,
        changeFrequency: "daily" as const,
        priority: area.type === "district" ? 0.8 : 0.7
      }));
  } catch {
    // A sitemap without area pages is still better than a failed request.
  }

  return [
    ...staticEntries,
    ...areaEntries,
    ...listings.map((listing) => ({
      url: `${SITE_URL}/listing/${listing.id}`,
      lastModified: listing.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7
    }))
  ];
}
