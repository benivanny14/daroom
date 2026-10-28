import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

const BASE_PATHS = ["", "/dalali", "/account", "/faq", "/privacy", "/terms"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.APP_URL || "https://darroom.co.tz";
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = BASE_PATHS.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? "daily" : "weekly",
    priority: path === "" ? 1 : path === "/dalali" ? 0.8 : 0.5
  }));

  let listings: { id: string; updatedAt: Date }[] = [];
  try {
    listings = await prisma.listing.findMany({
      where: { status: "APPROVED" },
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
      url: `${baseUrl}/listing/${listing.id}`,
      lastModified: listing.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7
    }))
  ];
}
