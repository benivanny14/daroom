import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getMediaUrl } from "@/lib/storage";
import { notExpiredFilter } from "@/lib/listing-policy";
import { maskPhone } from "@/lib/phone";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 48;

const SORTS: Record<string, Prisma.ListingOrderByWithRelationInput[]> = {
  featured: [{ isFeatured: "desc" }, { isAvailable: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  newest: [{ createdAt: "desc" }, { id: "desc" }],
  price_asc: [{ priceTzs: "asc" }, { id: "asc" }],
  price_desc: [{ priceTzs: "desc" }, { id: "desc" }]
};

const CACHE_CONTROL = "public, max-age=30, s-maxage=60, stale-while-revalidate=120";

export async function GET(request: NextRequest) {
  try {
    if (!(await enforceRateLimit({
      scope: "public-listings",
      clientId: clientIp(request.headers),
      limit: 180,
      windowSeconds: 60
    }))) {
      return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
    }
    const { searchParams } = new URL(request.url);
    const district = searchParams.get("district");
    const neighborhood = searchParams.get("neighborhood");
    const maxPrice = Number(searchParams.get("maxPrice"));
    const query = searchParams.get("q")?.trim();
    const bedrooms = searchParams.get("bedrooms");
    const furnished = searchParams.get("furnished");
    const allowsPets = searchParams.get("allowsPets");
    const sortKey = searchParams.get("sort") || "featured";
    const cursor = searchParams.get("cursor")?.trim() || null;
    const requestedLimit = Number(searchParams.get("limit"));

    const bedroomsNum = bedrooms ? Number(bedrooms) : null;
    const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;
    const orderBy = SORTS[sortKey] ?? SORTS.featured;

    const where: Prisma.ListingWhereInput = {
      status: "APPROVED",
      priceTzs: { gte: 50_000 },
      AND: [
        notExpiredFilter(),
        ...(query
          ? [{
              OR: [
                { title: { contains: query, mode: "insensitive" as const } },
                { description: { contains: query, mode: "insensitive" as const } },
                { neighborhood: { name: { contains: query, mode: "insensitive" as const } } },
                { district: { name: { contains: query, mode: "insensitive" as const } } }
              ]
            }]
          : [])
      ],
      ...(district ? { district: { name: district } } : {}),
      ...(neighborhood ? { neighborhood: { name: neighborhood } } : {}),
      ...(Number.isSafeInteger(maxPrice) && maxPrice > 0 ? { priceTzs: { lte: maxPrice } } : {}),
      ...(bedroomsNum ? (bedroomsNum >= 4 ? { bedrooms: { gte: 4 } } : { bedrooms: bedroomsNum }) : {}),
      ...(furnished === "true" ? { furnished: true } : furnished === "false" ? { furnished: false } : {}),
      ...(allowsPets === "true" ? { allowsPets: true } : allowsPets === "false" ? { allowsPets: false } : {})
    };

    const rows = await prisma.listing.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        district: { select: { name: true } },
        neighborhood: { select: { name: true } },
        priceTzs: true,
        minMonths: true,
        luku: true,
        water: true,
        phone: true,
        bedrooms: true,
        bathrooms: true,
        furnished: true,
        allowsPets: true,
        allowsStudents: true,
        isFeatured: true,
        isAvailable: true,
        latitude: true,
        longitude: true,
        photos: { select: { id: true, storageKey: true, altText: true }, orderBy: { createdAt: "asc" }, take: 6 }
      },
      orderBy,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && page.length ? page[page.length - 1].id : null;
    // Counting scans the filtered set, so only the first page pays for it.
    const total = cursor ? null : await prisma.listing.count({ where });

    const response = NextResponse.json({
      listings: page.map((listing) => ({
        id: listing.id,
        title: listing.title,
        description: listing.description,
        district: listing.district.name,
        neighborhood: listing.neighborhood.name,
        priceTzs: listing.priceTzs,
        minMonths: listing.minMonths,
        luku: listing.luku,
        water: listing.water,
        phone: null,
        phoneMasked: maskPhone(listing.phone),
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        furnished: listing.furnished,
        allowsPets: listing.allowsPets,
        allowsStudents: listing.allowsStudents,
        isFeatured: listing.isFeatured,
        isAvailable: listing.isAvailable,
        latitude: listing.latitude,
        longitude: listing.longitude,
        featured: listing.isFeatured,
        imageTone: "one" as const,
        photos: listing.photos.flatMap((photo) => {
          const url = getMediaUrl(photo.storageKey);
          return url ? [{ id: photo.id, url, altText: photo.altText }] : [];
        })
      })),
      nextCursor,
      total
    });
    response.headers.set("Cache-Control", CACHE_CONTROL);
    return response;
  } catch (error) {
    console.error("Public listing query failed", error);
    return NextResponse.json({ error: "Listings are unavailable right now." }, { status: 503 });
  }
}
