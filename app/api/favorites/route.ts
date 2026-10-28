import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, authErrorResponse, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMediaUrl } from "@/lib/storage";
import { notExpiredFilter } from "@/lib/listing-policy";
import { maskPhone } from "@/lib/phone";
import { withRateLimit } from "@/lib/rate-limit-middleware";
import { setSecurityHeaders } from "@/lib/security";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      const user = await requireUser();

      const favorites = await prisma.favorite.findMany({
        where: { userId: user.id },
        include: {
          listing: {
            include: {
              district: { select: { name: true } },
              neighborhood: { select: { name: true } },
              photos: { select: { id: true, storageKey: true, altText: true }, orderBy: { createdAt: "asc" } }
            }
          }
        },
        orderBy: { createdAt: "desc" }
      });

      const response = NextResponse.json({
        favorites: favorites.map(fav => ({
          id: fav.id,
          listing: {
            id: fav.listing.id,
            title: fav.listing.title,
            district: fav.listing.district.name,
            neighborhood: fav.listing.neighborhood.name,
            priceTzs: fav.listing.priceTzs,
            minMonths: fav.listing.minMonths,
            luku: fav.listing.luku,
            water: fav.listing.water,
            phone: null,
            phoneMasked: maskPhone(fav.listing.phone),
            status: fav.listing.status,
            isAvailable: fav.listing.isAvailable,
            expiresAt: fav.listing.expiresAt,
            photos: fav.listing.photos.flatMap(photo => {
              const url = getMediaUrl(photo.storageKey);
              return url ? [{ id: photo.id, url, altText: photo.altText }] : [];
            })
          },
          createdAt: fav.createdAt
        }))
      });

      return setSecurityHeaders(response);
    } catch (error) {
      return authErrorResponse(error);
    }
  });
}

export async function POST(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      assertSameOrigin(request);
      const user = await requireUser();
      const body = z.object({ listingId: z.string().min(1).max(64) }).safeParse(await request.json());
      if (!body.success) {
        return NextResponse.json({ error: "Listing ID is required." }, { status: 400 });
      }
      const { listingId } = body.data;

      const listing = await prisma.listing.findFirst({
        where: { id: listingId, status: "APPROVED", AND: [notExpiredFilter()] },
        select: { id: true }
      });

      if (!listing) {
        return NextResponse.json({ error: "Listing not found." }, { status: 404 });
      }

      const existing = await prisma.favorite.findUnique({
        where: {
          userId_listingId: {
            userId: user.id,
            listingId
          }
        }
      });

      if (existing) {
        return NextResponse.json({ error: "Listing is already in your favorites." }, { status: 400 });
      }

      const favorite = await prisma.favorite.create({
        data: {
          userId: user.id,
          listingId
        }
      });

      // Update analytics
      await prisma.listingAnalytics.upsert({
        where: { listingId },
        update: { favorites: { increment: 1 } },
        create: {
          listingId,
          favorites: 1,
          views: 0,
          whatsappClicks: 0,
          inquiries: 0
        }
      });

      const response = NextResponse.json({ favorite: { id: favorite.id } });
      return setSecurityHeaders(response);
    } catch (error) {
      return authErrorResponse(error);
    }
  });
}
