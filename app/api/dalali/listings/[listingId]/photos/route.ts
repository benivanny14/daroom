import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, authErrorResponse, requireAgent } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateUploadUrl } from "@/lib/storage";
import { validateFileUpload, generateStorageKey } from "@/lib/file-upload";
import { withRateLimit } from "@/lib/rate-limit-middleware";
import { setSecurityHeaders } from "@/lib/security";
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

      const rawBody = await readJsonBody(request, 2 * 1024);
      if (!rawBody.ok) return NextResponse.json({ error: "The data is invalid or too large." }, { status: rawBody.status });
      const parsed = z.object({
        contentType: z.enum(["image/jpeg", "image/jpg", "image/png", "image/webp"]),
        size: z.number().int().positive(),
        fileName: z.string().trim().max(255).optional()
      }).safeParse(rawBody.value);
      if (!parsed.success) return NextResponse.json({ error: "Photo details are invalid." }, { status: 400 });
      const { contentType, size, fileName } = parsed.data;
      const file = {
        type: contentType,
        size,
        name: fileName || "photo.jpg"
      };

      const validation = validateFileUpload(file);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      const storageKey = generateStorageKey(user.id, listingId, file.name);
      const { uploadUrl } = await generateUploadUrl(storageKey, contentType, 300, size);

      const response = NextResponse.json({
        uploadUrl,
        storageKey,
        expiresInSeconds: 300
      });

      return setSecurityHeaders(response);
    } catch (error) {
      return authErrorResponse(error);
    }
  });
}
