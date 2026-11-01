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
    const minPrice = Number(searchParams.get("minPrice"));
    const query = searchParams.get("q")?.trim();
    const bedrooms = searchParams.get("bedrooms");
    const furnished = searchParams.get("furnished");
    const allowsPets = searchParams.get("allowsPets");
    const allowsStudents = searchParams.get("students");
    const luku = searchParams.get("luku");
    const wifi = searchParams.get("wifi");
    const available = searchParams.get("available");
    const sortKey = searchParams.get("sort") || "featured";
    const cursor = searchParams.get("cursor")?.trim() || null;
    const requestedLimit = Number(searchParams.get("limit"));

    const bedroomsNum = bedrooms ? Number(bedrooms) : null;
    const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;
    const orderBy = SORTS[sortKey] ?? SORTS.featured;

    // Every listing is at least TSh 50,000; the tenant's range narrows it.
    const priceFilter: Prisma.IntFilter = { gte: 50_000 };
    if (Number.isSafeInteger(maxPrice) && maxPrice > 0) priceFilter.lte = maxPrice;
    if (Number.isSafeInteger(minPrice) && minPrice > 0) priceFilter.gte = Math.max(50_000, minPrice);

    const where: Prisma.ListingWhereInput = {
      status: "APPROVED",
      priceTzs: priceFilter,
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
      ...(bedroomsNum ? (bedroomsNum >= 4 ? { bedrooms: { gte: 4 } } : { bedrooms: bedroomsNum }) : {}),
      ...(furnished === "true" ? { furnished: true } : furnished === "false" ? { furnished: false } : {}),
      ...(allowsPets === "true" ? { allowsPets: true } : allowsPets === "false" ? { allowsPets: false } : {}),
      ...(allowsStudents === "true" ? { allowsStudents: true } : {}),
      ...(luku === "true" ? { luku: true } : {}),
      ...(wifi === "true" ? { hasWifi: true } : {}),
      ...(available === "true" ? { isAvailable: true } : available === "false" ? { isAvailable: false } : {})
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
        electricityMode: true,
        hasWifi: true,
        toiletMode: true,
        isFeatured: true,
        isAvailable: true,
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

    // One grouped query keeps review averages off the per-listing path.
    const ratingRows = page.length
      ? await prisma.review.groupBy({
          by: ["listingId"],
          where: { listingId: { in: page.map((listing) => listing.id) } },
          _avg: { rating: true },
          _count: { _all: true }
        })
      : [];
    const ratings = new Map(
      ratingRows.map((row) => [
        row.listingId,
        {
          average: row._avg.rating !== null ? Number(row._avg.rating.toFixed(1)) : null,
          count: row._count._all
        }
      ])
    );

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
        electricityMode: listing.electricityMode,
        hasWifi: listing.hasWifi,
        toiletMode: listing.toiletMode,
        isFeatured: listing.isFeatured,
        isAvailable: listing.isAvailable,
        featured: listing.isFeatured,
        imageTone: "one" as const,
        ratingAverage: ratings.get(listing.id)?.average ?? null,
        reviewCount: ratings.get(listing.id)?.count ?? 0,
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
