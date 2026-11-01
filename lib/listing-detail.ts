import { prisma } from "@/lib/prisma";
import { getMediaUrl } from "@/lib/storage";
import { notExpiredFilter } from "@/lib/listing-policy";
import { maskPhone } from "@/lib/phone";
import type { ListingDetailData } from "@/lib/listing-types";

/**
 * The one server-side query behind both the listing page and
 * `GET /api/listings/[id]`. Keeping it in one place means the page can render
 * the room in the first HTML response (good for search engines and slow phones)
 * while the JSON endpoint stays available for other clients.
 */
export async function getListingDetail(id: string): Promise<ListingDetailData | null> {
  const listing = await prisma.listing.findFirst({
    where: {
      id,
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
          createdAt: true,
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
      },
      _count: { select: { reviews: true } }
    }
  });

  if (!listing) return null;

  const photos = listing.photos.flatMap((photo) => {
    const url = getMediaUrl(photo.storageKey);
    return url ? [{ id: photo.id, url, altText: photo.altText }] : [];
  });

  const reviews = listing.reviews.map((review) => ({
    id: review.id,
    userName: review.user?.name || review.authorName || "Tenant",
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt.toISOString()
  }));

  const ratingAverage = reviews.length
    ? Number((reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1))
    : null;

  return {
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
    featured: listing.isFeatured,
    imageTone: "one",
    isAvailable: listing.isAvailable,
    createdAt: listing.createdAt.toISOString(),
    ownerId: listing.owner.id,
    dalali: {
      id: listing.owner.id,
      name: listing.owner.name,
      isVerified: listing.owner.idVerification.length > 0,
      memberSince: listing.owner.createdAt.toISOString()
    },
    photos,
    reviews,
    ratingAverage,
    reviewCount: listing._count.reviews
  };
}

/** Fire-and-forget view counter; a failed write must never block the page. */
export function recordListingView(id: string): void {
  prisma.listingAnalytics
    .upsert({
      where: { listingId: id },
      update: { views: { increment: 1 }, lastViewedAt: new Date() },
      create: {
        listingId: id,
        views: 1,
        whatsappClicks: 0,
        favorites: 0,
        inquiries: 0,
        lastViewedAt: new Date()
      }
    })
    .catch((error) => console.error("View tracking failed", error));
}
