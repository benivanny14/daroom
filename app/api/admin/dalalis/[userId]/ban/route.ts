import { NextRequest, NextResponse } from "next/server";
import { AuthError, assertSameOrigin, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { banDalali } from "@/lib/moderation";
import { recordAdminAudit } from "@/lib/audit";
import { deleteMediaObject, deleteVerificationObject } from "@/lib/storage";
import { readJsonBody } from "@/lib/http";
import { clientIp } from "@/lib/rate-limit";
import { z } from "zod";

const banInput = z.object({
  reason: z.string().trim().min(3).max(500)
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await context.params;
    assertSameOrigin(request);
    const admin = await requireAdmin();

    const rawBody = await readJsonBody(request, 2 * 1024);
    if (!rawBody.ok) {
      return NextResponse.json({ error: "The data is invalid or too large." }, { status: rawBody.status });
    }
    const parsed = banInput.safeParse(rawBody.value);
    if (!parsed.success) {
      return NextResponse.json({ error: "Enter a reason for banning the account." }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true, email: true, role: true }
    });
    if (!target || target.role !== "DALALI") {
      return NextResponse.json({ error: "Agent account not found." }, { status: 404 });
    }

    // Collect the stored files first: the transaction removes the rows that
    // point at them, and leaving them behind would keep deleted accounts' photos
    // and identity documents online forever.
    const [listings, documents] = await Promise.all([
      prisma.listing.findMany({
        where: { ownerId: target.id },
        select: { photos: { select: { storageKey: true } } }
      }),
      prisma.idVerification.findMany({
        where: { userId: target.id },
        select: { documentUrl: true }
      })
    ]);
    const photoKeys = listings.flatMap((listing) => listing.photos.map((photo) => photo.storageKey));
    const documentKeys = documents.map((document) => document.documentUrl);

    await banDalali(prisma, {
      userId: target.id,
      normalizedPhone: target.phone,
      normalizedEmail: target.email.toLowerCase(),
      reason: parsed.data.reason,
      moderatorId: admin.id
    });

    // Public photos and private identity documents live in different buckets.
    const deletions = await Promise.allSettled([
      ...photoKeys.map((key) => deleteMediaObject(key)),
      ...documentKeys.map((key) =>
        key.startsWith("verification/")
          ? deleteVerificationObject(key)
          : deleteMediaObject(key)
      )
    ]);
    const failed = deletions.filter((result) => result.status === "rejected").length;
    if (failed) console.error("Could not delete every file of a banned account", { failed });

    await recordAdminAudit({
      actorId: admin.id,
      action: "dalali.ban",
      targetType: "user",
      targetId: target.id,
      summary: `Banned the Agent account ${target.email}`,
      metadata: { reason: parsed.data.reason },
      ip: clientIp(request.headers)
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Ban dalali failed", error);
    return NextResponse.json({ error: "Could not ban the account." }, { status: 503 });
  }
}
