import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireAgent } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/rate-limit-middleware";
import { setSecurityHeaders } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      const user = await requireAgent();

      const listings = await prisma.listing.findMany({
        where: { ownerId: user.id },
        include: {
          analytics: true,
          _count: {
            select: {
              favorites: true,
              reviews: true,
              appointments: true
            }
          }
        }
      });

      const totalViews = listings.reduce((sum, l) => sum + (l.analytics?.views || 0), 0);
      const totalWhatsAppClicks = listings.reduce((sum, l) => sum + (l.analytics?.whatsappClicks || 0), 0);
      const totalFavorites = listings.reduce((sum, l) => sum + l._count.favorites, 0);
      const totalReviews = listings.reduce((sum, l) => sum + l._count.reviews, 0);
      const totalInquiries = listings.reduce((sum, l) => sum + (l.analytics?.inquiries || 0), 0);

      const response = NextResponse.json({
        summary: {
          totalListings: listings.length,
          totalViews,
          totalWhatsAppClicks,
          totalFavorites,
          totalReviews,
          totalInquiries
        },
        listings: listings.map(listing => ({
          id: listing.id,
          title: listing.title,
          status: listing.status,
          priceTzs: listing.priceTzs,
          views: listing.analytics?.views || 0,
          whatsappClicks: listing.analytics?.whatsappClicks || 0,
          favorites: listing._count.favorites,
          reviews: listing._count.reviews,
          inquiries: listing.analytics?.inquiries || 0,
          lastViewedAt: listing.analytics?.lastViewedAt
        }))
      });

      return setSecurityHeaders(response);
    } catch (error) {
      return authErrorResponse(error);
    }
  });
}
