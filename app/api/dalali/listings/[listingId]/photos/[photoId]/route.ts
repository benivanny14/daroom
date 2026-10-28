import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, authErrorResponse, requireAgent } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteMediaObject } from "@/lib/storage";
import { readJsonBody } from "@/lib/http";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ listingId: string; photoId: string }> }
) {
  try {
    const { listingId, photoId } = await context.params;
    assertSameOrigin(request);
    const user = await requireAgent();
    const rawBody = await readJsonBody(request, 1024);
    if (!rawBody.ok) {
      return NextResponse.json({ error: "The data is invalid or too large." }, { status: rawBody.status });
    }
    const body = z.object({
      altText: z.string().trim().min(3).max(160)
    }).safeParse(rawBody.value);
    if (!body.success) {
      return NextResponse.json({ error: "Photo description must be 3 to 160 characters." }, { status: 400 });
    }

    const changed = await prisma.listingPhoto.updateMany({
      where: {
        id: photoId,
        listingId,
        listing: { ownerId: user.id }
      },
      data: { altText: body.data.altText }
    });
    if (!changed.count) {
      return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, photo: { id: photoId, altText: body.data.altText } });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ listingId: string; photoId: string }> }
) {
  try {
    const { listingId, photoId } = await context.params;
    assertSameOrigin(request);
    const user = await requireAgent();

    const photo = await prisma.listingPhoto.findFirst({
      where: {
        id: photoId,
        listingId,
        listing: { ownerId: user.id }
      },
      select: { id: true, storageKey: true }
    });

    if (!photo) {
      return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.listingPhoto.delete({ where: { id: photo.id } });
    });

    try {
      await deleteMediaObject(photo.storageKey);
    } catch (storageError) {
      console.warn("Could not delete media object", storageError);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
