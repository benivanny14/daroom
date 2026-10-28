import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, authErrorResponse, requireAgent } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasListingWriteAccess } from "@/lib/subscriptions";
import { listingExpiryFrom } from "@/lib/listing-policy";
import { withRateLimit } from "@/lib/rate-limit-middleware";
import { setSecurityHeaders } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ listingId: string }> }
) {
  return withRateLimit(request, async () => {
    try {
      assertSameOrigin(request);
      const user = await requireAgent();
      const { listingId } = await context.params;

      const listing = await prisma.listing.findFirst({
        where: { id: listingId, ownerId: user.id },
        select: { id: true, status: true }
      });
      if (!listing) {
        return NextResponse.json({ error: "Listing not found." }, { status: 404 });
      }
      if (!["APPROVED", "EXPIRED"].includes(listing.status)) {
        return NextResponse.json({
          error: "This listing cannot be extended right now. Edit or resubmit it first."
        }, { status: 400 });
      }

      const subscription = await prisma.subscription.findFirst({
        where: { userId: user.id },
        orderBy: { endsAt: "desc" }
      });
      if (!hasListingWriteAccess(subscription)) {
        return NextResponse.json({ error: "Your subscription has expired. Pay TSh 5,000 before extending a listing." }, { status: 403 });
      }

      const expiresAt = listingExpiryFrom();
      const updated = await prisma.listing.update({
        where: { id: listing.id },
        data: { expiresAt, status: "APPROVED" }
      });

      return setSecurityHeaders(NextResponse.json({
        ok: true,
        status: updated.status,
        expiresAt: updated.expiresAt
      }));
    } catch (error) {
      return authErrorResponse(error);
    }
  });
}
