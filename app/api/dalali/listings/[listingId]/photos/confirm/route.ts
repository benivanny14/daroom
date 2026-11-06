import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { assertSameOrigin, authErrorResponse, requireAgent } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/rate-limit-middleware";
import { setSecurityHeaders } from "@/lib/security";
import { objectInfo, deleteMediaObject } from "@/lib/storage";
import { MAX_PHOTO_BYTES, PHOTO_LIMIT_KB } from "@/lib/file-upload";
import { readJsonBody } from "@/lib/http";
import { hasListingWriteAccess } from "@/lib/subscriptions";
import { photoLimitForPlan } from "@/lib/subscriptions-plans";
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

      const subscription = await prisma.subscription.findFirst({
        where: { userId: user.id },
        orderBy: { endsAt: "desc" }
      });
      if (!hasListingWriteAccess(subscription) && !user.freeAccess) {
        return NextResponse.json({ error: "Your subscription has expired. Pay TSh 5,000 before adding photos." }, { status: 403 });
      }

      const photoLimit = photoLimitForPlan(subscription?.plan);
      if (listing.photos.length >= photoLimit) {
        return NextResponse.json({ error: `You have reached the maximum number of photos (${photoLimit}).` }, { status: 400 });
      }

      const object = await objectInfo(storageKey);
      const extension = storageKey.split(".").pop()?.toLowerCase();
      const allowedExtensions = ["jpg", "jpeg", "png", "webp"];
      const contentTypeAllowed = !object?.contentType ||
        ["image/jpeg", "image/png", "image/webp"].includes(object.contentType);
      if (!object || object.size <= 0) {
        return NextResponse.json({ error: "The photo was not uploaded. Try again." }, { status: 400 });
      }
      if (object.size > MAX_PHOTO_BYTES) {
        // The signed upload URL cannot enforce a size, so an oversized object
        // may already be in the bucket. Remove it before rejecting the photo,
        // otherwise failed uploads slowly consume the storage quota.
        await deleteMediaObject(storageKey).catch(() => undefined);
        return NextResponse.json(
          { error: `Photos must be ${PHOTO_LIMIT_KB} KB or smaller. Choose a smaller photo or try again.` },
          { status: 400 }
        );
      }
      if (
        !extension ||
        !allowedExtensions.includes(extension) ||
        !contentTypeAllowed
      ) {
        await deleteMediaObject(storageKey).catch(() => undefined);
        return NextResponse.json({ error: "The photo failed the type check. Use a JPEG, PNG or WebP image." }, { status: 400 });
      }

      const photo = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const currentCount = await tx.listingPhoto.count({ where: { listingId } });
        if (currentCount >= photoLimit) throw new PhotoLimitError(photoLimit);
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
        return NextResponse.json({ error: `A listing can have at most ${error.limit} photos.` }, { status: 400 });
      }
      console.error("Photo confirmation failed", error);
      return authErrorResponse(error);
    }
  });
}

class PhotoLimitError extends Error {
  constructor(public readonly limit: number) {
    super(`A listing can have at most ${limit} photos.`);
  }
}
