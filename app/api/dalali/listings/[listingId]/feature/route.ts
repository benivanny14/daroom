import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, authErrorResponse, requireAgent } from "@/lib/auth";
import { readJsonBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { hasFeaturedSlots } from "@/lib/subscriptions-plans";
import { withRateLimit } from "@/lib/rate-limit-middleware";
import { setSecurityHeaders } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listingId: string }> }
) {
  return withRateLimit(request, async () => {
    try {
      assertSameOrigin(request);
      const user = await requireAgent();
      const { listingId } = await params;
      const rawBody = await readJsonBody(request, 1024);
      if (!rawBody.ok) return NextResponse.json({ error: "The data is invalid or too large." }, { status: rawBody.status });
      const { days } = rawBody.value as { days?: number | undefined };
      const daysRequested = typeof days === "number" ? days : Number.NaN;
      if (!Number.isInteger(daysRequested) || daysRequested < 1 || daysRequested > 30) {
        return NextResponse.json({ error: "The requested days must be between 1 and 30." }, { status: 400 });
      }

      const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        include: { owner: true }
      });

      if (!listing) {
        return NextResponse.json({ error: "Listing not found." }, { status: 404 });
      }

      if (listing.ownerId !== user.id) {
        return NextResponse.json({ error: "You do not have permission to feature this listing." }, { status: 403 });
      }

      // Check subscription
      const subscription = await prisma.subscription.findFirst({
        where: {
          userId: user.id,
          status: "ACTIVE",
          endsAt: { gte: new Date() }
        }
      });

      if (!subscription) {
        return NextResponse.json({ error: "You need an active subscription." }, { status: 400 });
      }

      // Check featured slots
      const featuredCount = await prisma.listing.count({
        where: {
          ownerId: user.id,
          isFeatured: true,
          featuredUntil: { gte: new Date() }
        }
      });

      if (!hasFeaturedSlots(featuredCount, subscription.plan)) {
        return NextResponse.json({ error: "You have reached the maximum number of featured listings for your plan." }, { status: 400 });
      }

      const featuredUntil = new Date();
      featuredUntil.setDate(featuredUntil.getDate() + daysRequested);

      await prisma.listing.update({
        where: { id: listingId },
        data: {
          isFeatured: true,
          featuredUntil
        }
      });

      const response = NextResponse.json({
        success: true,
        featuredUntil
      });

      return setSecurityHeaders(response);
    } catch (error) {
      return authErrorResponse(error);
    }
  });
}
