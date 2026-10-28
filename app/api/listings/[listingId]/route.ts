import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMediaUrl } from "@/lib/storage";
import { notExpiredFilter } from "@/lib/listing-policy";
import { maskPhone } from "@/lib/phone";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ listingId: string }> }
) {
  try {
    if (!(await enforceRateLimit({
      scope: "listing-detail",
      clientId: clientIp(request.headers),
      limit: 60,
      windowSeconds: 60
    }))) {
      return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
    }
    const { listingId } = await context.params;
    const listing = await prisma.listing.findFirst({
      where: {
        id: listingId,
        status: "APPROVED",
        priceTzs: { gte: 50_000 },
        AND: [notExpiredFilter()]
      },
      include: {
        district: { select: { name: true } },
        neighborhood: { select: { name: true } },
        owner: {
          select: {
            id: true,
            name: true,
            idVerification: {
              where: { status: "APPROVED" },
              take: 1,
              select: { id: true }
            }
          }
        },
        photos: { select: { id: true, storageKey: true, altText: true }, orderBy: { createdAt: "asc" } },
        reviews: {
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 30
        }
      }
    });

    if (!listing) {
      return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    }

    // Increment view count for this single listing
    prisma.listingAnalytics.upsert({
      where: { listingId: listing.id },
      update: { views: { increment: 1 }, lastViewedAt: new Date() },
      create: {
        listingId: listing.id,
        views: 1,
        whatsappClicks: 0,
        favorites: 0,
        inquiries: 0,
        lastViewedAt: new Date()
      }
    }).catch((err) => console.error("View tracking failed", err));

    return NextResponse.json({
      listing: {
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
        featured: listing.isFeatured,
        imageTone: "one",
        isAvailable: listing.isAvailable,
        latitude: listing.latitude,
        longitude: listing.longitude,
        createdAt: listing.createdAt,
        dalali: {
          name: listing.owner.name,
          isVerified: listing.owner.idVerification.length > 0
        },
        photos: listing.photos.flatMap((photo) => {
          const url = getMediaUrl(photo.storageKey);
          return url ? [{ id: photo.id, url, altText: photo.altText }] : [];
        }),
        reviews: listing.reviews.map((r) => ({
          id: r.id,
          userName: r.user?.name || r.authorName || "Tenant",
          rating: r.rating,
          comment: r.comment,
          createdAt: r.createdAt
        }))
      }
    });
  } catch (error) {
    console.error("Single listing fetch failed", error);
    return NextResponse.json({ error: "Listing is unavailable right now." }, { status: 503 });
  }
}
