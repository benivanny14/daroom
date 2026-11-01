import type { MetadataRoute } from "next";
import { notExpiredFilter } from "@/lib/listing-policy";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/site";

const BASE_PATHS = ["", "/dalali", "/account", "/faq", "/privacy", "/terms", "/contact"];

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

  return [
    ...staticEntries,
    ...listings.map((listing) => ({
      url: `${SITE_URL}/listing/${listing.id}`,
      lastModified: listing.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7
    }))
  ];
}
