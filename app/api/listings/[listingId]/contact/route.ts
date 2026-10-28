import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, authErrorResponse, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notExpiredFilter } from "@/lib/listing-policy";
import { formatTanzaniaPhone } from "@/lib/phone";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { withRateLimit } from "@/lib/rate-limit-middleware";
import { setSecurityHeaders } from "@/lib/security";

export const dynamic = "force-dynamic";

/**
 * Reveal a Dalali's phone number only to signed-in, email-verified users.
 * Every reveal is rate-limited and counted as a WhatsApp contact intent.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ listingId: string }> }
) {
  return withRateLimit(request, async () => {
    try {
      assertSameOrigin(request);
      const user = await requireUser();
      const { listingId } = await context.params;

      if (!(await enforceRateLimit({
        scope: "listing-contact",
        clientId: `${user.id}:${clientIp(request.headers)}`,
        limit: 60,
        windowSeconds: 3600
      }))) {
        return NextResponse.json({ error: "You've requested too many phone numbers this hour. Try again later." }, { status: 429 });
      }

      const listing = await prisma.listing.findFirst({
        where: { id: listingId, status: "APPROVED", AND: [notExpiredFilter()] },
        select: { id: true, phone: true }
      });
      if (!listing) {
        return NextResponse.json({ error: "Listing not found." }, { status: 404 });
      }

      await prisma.listingAnalytics.upsert({
        where: { listingId: listing.id },
        update: { whatsappClicks: { increment: 1 } },
        create: { listingId: listing.id, views: 0, whatsappClicks: 1, favorites: 0, inquiries: 0 }
      });

      return setSecurityHeaders(NextResponse.json({
        phone: listing.phone,
        formattedPhone: formatTanzaniaPhone(listing.phone)
      }));
    } catch (error) {
      return authErrorResponse(error);
    }
  });
}
