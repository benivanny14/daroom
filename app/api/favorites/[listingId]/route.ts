import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, authErrorResponse, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/rate-limit-middleware";
import { setSecurityHeaders } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ listingId: string }> }
) {
  return withRateLimit(request, async () => {
    try {
      assertSameOrigin(request);
      const user = await requireUser();
      const { listingId } = await params;

      const favorite = await prisma.favorite.findUnique({
        where: {
          userId_listingId: {
            userId: user.id,
            listingId
          }
        }
      });

      if (!favorite) {
        return NextResponse.json({ error: "Listing is not in your favorites." }, { status: 404 });
      }

      await prisma.$transaction([
        prisma.favorite.delete({ where: { id: favorite.id } }),
        prisma.listingAnalytics.updateMany({
          where: { listingId, favorites: { gt: 0 } },
          data: { favorites: { decrement: 1 } }
        })
      ]);

      return setSecurityHeaders(NextResponse.json({ success: true }));
    } catch (error) {
      return authErrorResponse(error);
    }
  });
}
