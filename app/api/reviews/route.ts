import { NextRequest, NextResponse } from "next/server";
import { AuthError, assertSameOrigin, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/http";
import { withRateLimit } from "@/lib/rate-limit-middleware";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { setSecurityHeaders } from "@/lib/security";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      const { searchParams } = new URL(request.url);
      const listingId = searchParams.get("listingId");

      if (!listingId || listingId.length > 64) {
        return NextResponse.json({ error: "Listing ID is required." }, { status: 400 });
      }

      const reviews = await prisma.review.findMany({
        where: { listingId },
        include: {
          user: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: { createdAt: "desc" },
        take: 50
      });

      const response = NextResponse.json({
        reviews: reviews.map(review => ({
          id: review.id,
          userId: review.userId,
          userName: review.user?.name || review.authorName || "Tenant",
          rating: review.rating,
          comment: review.comment,
          isVerified: review.isVerified,
          createdAt: review.createdAt
        }))
      });

      return setSecurityHeaders(response);
    } catch (error) {
      console.error("Reviews fetch failed", error);
      return NextResponse.json({ error: "Service unavailable right now." }, { status: 500 });
    }
  });
}

export async function POST(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      assertSameOrigin(request);
      // Reviews may be written without an account, so they get their own tight
      // per-IP budget instead of the general API allowance.
      if (!(await enforceRateLimit({
        scope: "create-review",
        clientId: clientIp(request.headers),
        limit: 5,
        windowSeconds: 3600
      }))) {
        return NextResponse.json({ error: "You have posted several reviews recently. Try again in a while." }, { status: 429 });
      }
      const user = await getSessionUser();
      const rawBody = await readJsonBody(request, 4 * 1024);
      if (!rawBody.ok) {
        return NextResponse.json({ error: "Invalid request or data too large." }, { status: rawBody.status });
      }
      const body = z.object({
        listingId: z.string().min(1).max(64),
        rating: z.number().int().min(1).max(5),
        comment: z.string().trim().max(1000).optional().default(""),
        authorName: z.string().trim().max(60).optional()
      }).safeParse(rawBody.value);

      if (!body.success) {
        return NextResponse.json({ error: "Please check your rating and comment." }, { status: 400 });
      }

      const listing = await prisma.listing.findFirst({
        where: { id: body.data.listingId, status: "APPROVED" },
        select: { id: true }
      });

      if (!listing) {
        return NextResponse.json({ error: "Listing not found." }, { status: 404 });
      }

      if (user) {
        const existing = await prisma.review.findFirst({
          where: {
            listingId: body.data.listingId,
            userId: user.id
          },
          select: { id: true }
        });

        if (existing) {
          return NextResponse.json({ error: "You've already reviewed this listing." }, { status: 400 });
        }
      }

      const cleanAuthor = (body.data.authorName || user?.name || "Tenant").slice(0, 60) || "Tenant";

      if (!user) {
        // Guest reviews cannot be limited per account, so the same text from the
        // same author on the same listing is only accepted once per hour.
        const duplicate = await prisma.review.findFirst({
          where: {
            listingId: body.data.listingId,
            userId: null,
            authorName: cleanAuthor,
            comment: body.data.comment,
            createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }
          },
          select: { id: true }
        });
        if (duplicate) {
          return NextResponse.json({ error: "This review was just posted." }, { status: 400 });
        }
      }

      const review = await prisma.review.create({
        data: {
          listingId: body.data.listingId,
          userId: user?.id || null,
          authorName: cleanAuthor,
          rating: body.data.rating,
          comment: body.data.comment,
          isVerified: Boolean(user)
        }
      });

      const response = NextResponse.json({
        review: {
          id: review.id,
          userName: cleanAuthor,
          rating: review.rating,
          comment: review.comment,
          isVerified: review.isVerified,
          createdAt: review.createdAt
        }
      });

      return setSecurityHeaders(response);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
      console.error("Review creation failed", error);
      return NextResponse.json({ error: "Service unavailable right now." }, { status: 500 });
    }
  });
}
