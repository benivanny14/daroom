import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { assertSameOrigin, authErrorResponse, requireAgent } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/http";
import { hasListingWriteAccess } from "@/lib/subscriptions";
import { findOrCreateNeighborhood } from "@/lib/geography";
import { listingExpiryFrom } from "@/lib/listing-policy";
import { z } from "zod";

const listingUpdate = z.object({
  title: z.string().trim().min(5).max(100),
  description: z.string().trim().min(20).max(3000),
  district: z.string().trim().min(2).max(80),
  neighborhood: z.string().trim().min(2).max(100),
  priceTzs: z.number().int().min(50_000).max(100_000_000),
  minMonths: z.number().int().min(1).max(36),
  luku: z.boolean(),
  water: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(9).max(24),
  acceptNoInspectionFee: z.literal(true),
  bedrooms: z.number().int().min(1).max(20).optional(),
  bathrooms: z.number().int().min(1).max(10).optional(),
  furnished: z.boolean().optional(),
  allowsPets: z.boolean().optional(),
  allowsStudents: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional()
});

const availabilityToggle = z.object({
  isAvailable: z.boolean()
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ listingId: string }> }
) {
  try {
    const { listingId } = await context.params;
    assertSameOrigin(request);
    const user = await requireAgent();
    const rawBody = await readJsonBody(request, 16 * 1024);
    if (!rawBody.ok) return NextResponse.json({ error: "The data is invalid or too large." }, { status: rawBody.status });

    // Bring a hidden listing back into search
    if ((rawBody.value as Record<string, unknown>).action === "restore") {
      const restored = await prisma.listing.updateMany({
        where: { id: listingId, ownerId: user.id, status: "HIDDEN" },
        data: { status: "APPROVED" }
      });
      if (!restored.count) return NextResponse.json({ error: "This listing cannot be restored." }, { status: 400 });
      return NextResponse.json({ ok: true, status: "APPROVED" });
    }

    // Allow quick availability toggle without sending full listing form
    const toggleCheck = availabilityToggle.safeParse(rawBody.value);
    if (toggleCheck.success && Object.keys(rawBody.value as Record<string, unknown>).length === 1) {
      const changed = await prisma.listing.updateMany({
        where: { id: listingId, ownerId: user.id },
        data: { isAvailable: toggleCheck.data.isAvailable }
      });
      if (!changed.count) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
      return NextResponse.json({ ok: true, isAvailable: toggleCheck.data.isAvailable });
    }

    const input = listingUpdate.safeParse(rawBody.value);
    if (!input.success) return NextResponse.json({ error: "Listing details are invalid." }, { status: 400 });
    const phone = input.data.phone.replace(/[^\d]/g, "");
    if (!/^255[67]\d{8}$/.test(phone)) {
      return NextResponse.json({ error: "Use a Tanzanian WhatsApp number starting with 255." }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const ownedListing = await tx.listing.findFirst({
        where: { id: listingId, ownerId: user.id },
        select: { id: true }
      });
      if (!ownedListing) return { status: "missing" as const };
      const subscription = await tx.subscription.findFirst({
        where: { userId: user.id },
        orderBy: { endsAt: "desc" }
      });
      if (!hasListingWriteAccess(subscription)) return { status: "expired" as const };
      const neighborhood = await findOrCreateNeighborhood(
        tx,
        input.data.district,
        input.data.neighborhood
      );
      if (!neighborhood) return { status: "invalid-area" as const };
      const changed = await tx.listing.updateMany({
        where: { id: listingId, ownerId: user.id },
        data: {
          districtId: neighborhood.districtId,
          neighborhoodId: neighborhood.id,
          title: input.data.title,
          description: input.data.description,
          priceTzs: input.data.priceTzs,
          minMonths: input.data.minMonths,
          luku: input.data.luku,
          water: input.data.water,
          phone,
          ...(input.data.bedrooms !== undefined ? { bedrooms: input.data.bedrooms } : {}),
          ...(input.data.bathrooms !== undefined ? { bathrooms: input.data.bathrooms } : {}),
          ...(input.data.furnished !== undefined ? { furnished: input.data.furnished } : {}),
          ...(input.data.allowsPets !== undefined ? { allowsPets: input.data.allowsPets } : {}),
          ...(input.data.allowsStudents !== undefined ? { allowsStudents: input.data.allowsStudents } : {}),
          ...(input.data.isAvailable !== undefined ? { isAvailable: input.data.isAvailable } : {}),
          ...(input.data.latitude !== undefined ? { latitude: input.data.latitude } : {}),
          ...(input.data.longitude !== undefined ? { longitude: input.data.longitude } : {}),
          inspectionFeePolicyAcceptedAt: new Date(),
          expiresAt: listingExpiryFrom(),
          rejectionReason: null
        }
      });
      return { status: changed.count ? "ok" as const : "missing" as const };
    });
    if (updated.status === "expired") return NextResponse.json({ error: "Your subscription has expired. Pay for a subscription before editing a listing." }, { status: 403 });
    if (updated.status === "invalid-area") return NextResponse.json({ error: "Select a valid Dar es Salaam district." }, { status: 400 });
    if (updated.status === "missing") return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ listingId: string }> }
) {
  try {
    const { listingId } = await context.params;
    assertSameOrigin(request);
    const user = await requireAgent();
    const changed = await prisma.listing.updateMany({
      where: { id: listingId, ownerId: user.id },
      data: { status: "HIDDEN" }
    });
    if (!changed.count) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
