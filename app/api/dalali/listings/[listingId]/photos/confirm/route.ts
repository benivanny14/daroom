import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { assertSameOrigin, authErrorResponse, requireAgent } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/rate-limit-middleware";
import { setSecurityHeaders } from "@/lib/security";
import { objectInfo } from "@/lib/storage";
import { readJsonBody } from "@/lib/http";
import { hasListingWriteAccess } from "@/lib/subscriptions";
import { z } from "zod";

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
      const rawBody = await readJsonBody(request, 2 * 1024);
      if (!rawBody.ok) return NextResponse.json({ error: "The data is invalid or too large." }, { status: rawBody.status });
      const body = z.object({
        storageKey: z.string().min(20).max(300),
        altText: z.string().trim().min(3).max(160).default("Room photo")
      }).safeParse(rawBody.value);
      if (!body.success || !body.data.storageKey.startsWith(`listings/${user.id}/${listingId}/`)) {
        return NextResponse.json({ error: "Photo details are invalid." }, { status: 400 });
      }
      const { storageKey, altText } = body.data;

      const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        select: {
          id: true,
          ownerId: true,
          photos: { select: { id: true } }
        }
      });

      if (!listing) {
        return NextResponse.json({ error: "Listing not found." }, { status: 404 });
      }

      if (listing.ownerId !== user.id) {
        return NextResponse.json({ error: "You do not have permission to add photos." }, { status: 403 });
      }

      if (listing.photos.length >= 10) {
        return NextResponse.json({ error: "You have reached the maximum number of photos (10)." }, { status: 400 });
      }

      const subscription = await prisma.subscription.findFirst({
        where: { userId: user.id },
        orderBy: { endsAt: "desc" }
      });
      if (!hasListingWriteAccess(subscription)) {
        return NextResponse.json({ error: "Your subscription has expired. Pay TSh 5,000 before adding photos." }, { status: 403 });
      }

      const object = await objectInfo(storageKey);
      const extension = storageKey.split(".").pop()?.toLowerCase();
      const allowedExtensions = ["jpg", "jpeg", "png", "webp"];
      const contentTypeAllowed = !object?.contentType ||
        ["image/jpeg", "image/png", "image/webp"].includes(object.contentType);
      if (
        !object ||
        object.size <= 0 ||
        object.size > 5 * 1024 * 1024 ||
        !extension ||
        !allowedExtensions.includes(extension) ||
        !contentTypeAllowed
      ) {
        return NextResponse.json({ error: "The photo failed the type or size check." }, { status: 400 });
      }

      const photo = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const currentCount = await tx.listingPhoto.count({ where: { listingId } });
        if (currentCount >= 10) throw new PhotoLimitError();
        return tx.listingPhoto.create({ data: { listingId, storageKey, altText } });
      });
      const response = NextResponse.json({
        photo: {
          id: photo.id,
          storageKey: photo.storageKey,
          altText: photo.altText
        }
      });

      return setSecurityHeaders(response);
    } catch (error) {
      if (error instanceof PhotoLimitError) {
        return NextResponse.json({ error: "A listing can have at most 10 photos." }, { status: 400 });
      }
      console.error("Photo confirmation failed", error);
      return authErrorResponse(error);
    }
  });
}

class PhotoLimitError extends Error {}
