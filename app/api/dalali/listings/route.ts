import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { assertSameOrigin, authErrorResponse, requireAgent } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/http";
import { hasListingWriteAccess } from "@/lib/subscriptions";
import { canUserAddListing } from "@/lib/subscriptions-plans";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { findOrCreateNeighborhood } from "@/lib/geography";
import { getMediaUrl } from "@/lib/storage";
import { listingExpiryFrom } from "@/lib/listing-policy";
import { emailConfigured, sendNewListingNotification } from "@/lib/email";
import { z } from "zod";

const listingInput = z.object({
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
  bedrooms: z.number().int().min(1).max(20).optional().default(1),
  bathrooms: z.number().int().min(1).max(10).optional().default(1),
  furnished: z.boolean().optional().default(false),
  allowsPets: z.boolean().optional().default(false),
  allowsStudents: z.boolean().optional().default(true),
  isAvailable: z.boolean().optional().default(true),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional()
});

export async function GET() {
  try {
    const user = await requireAgent();
    const [listings, subscription, verification, appointments] = await Promise.all([
      prisma.listing.findMany({
        where: { ownerId: user.id },
        include: {
          district: { select: { name: true } },
          neighborhood: { select: { name: true } },
          photos: { select: { id: true, storageKey: true, altText: true }, orderBy: { createdAt: "asc" } }
        },
        orderBy: { createdAt: "desc" }
      }),
      prisma.subscription.findFirst({ where: { userId: user.id }, orderBy: { endsAt: "desc" } }),
      prisma.idVerification.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
      prisma.viewingAppointment.findMany({
        where: { listing: { ownerId: user.id } },
        include: { listing: { select: { id: true, title: true } } },
        orderBy: { scheduledAt: "asc" },
        take: 50
      })
    ]);
    return NextResponse.json({
      listings: listings.map((listing) => ({
        ...listing,
        photos: listing.photos.flatMap((photo) => {
          const url = getMediaUrl(photo.storageKey);
          return url ? [{ ...photo, url }] : [photo];
        })
      })),
      subscription: subscription
        ? {
            startsAt: subscription.startsAt,
            endsAt: subscription.endsAt,
            plan: subscription.plan,
            active: hasListingWriteAccess(subscription)
          }
        : null,
      verification: verification
        ? {
            id: verification.id,
            documentType: verification.documentType,
            status: verification.status,
            rejectedReason: verification.rejectedReason
          }
        : null,
      appointments
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireAgent();
    if (!(await enforceRateLimit({
      scope: "create-listing",
      clientId: `${user.id}:${clientIp(request.headers)}`,
      limit: 10,
      windowSeconds: 3600
    }))) {
      return NextResponse.json({ error: "You have reached the limit for new listings for now." }, { status: 429 });
    }

    const rawBody = await readJsonBody(request, 16 * 1024);
    if (!rawBody.ok) return NextResponse.json({ error: "The data is invalid or too large." }, { status: rawBody.status });
    const input = listingInput.safeParse(rawBody.value);
    if (!input.success) return NextResponse.json({ error: "Listing details are invalid." }, { status: 400 });
    const phone = input.data.phone.replace(/[^\d]/g, "");
    if (!/^255[67]\d{8}$/.test(phone)) {
      return NextResponse.json({ error: "Use a Tanzanian WhatsApp number starting with 255." }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const subscription = await tx.subscription.findFirst({
        where: { userId: user.id },
        orderBy: { endsAt: "desc" }
      });
      if (!subscription || !hasListingWriteAccess(subscription)) return null;
      const ownedCount = await tx.listing.count({ where: { ownerId: user.id } });
      if (!canUserAddListing(ownedCount, subscription.plan)) {
        throw new ListingInputError(`Your plan (${subscription.plan}) has reached its listing limit. Upgrade your plan to add more.`);
      }

      const neighborhood = await findOrCreateNeighborhood(
        tx,
        input.data.district,
        input.data.neighborhood
      );
      if (!neighborhood) throw new ListingInputError("Select a valid Dar es Salaam district.");
      return tx.listing.create({
        data: {
          ownerId: user.id,
          districtId: neighborhood.districtId,
          neighborhoodId: neighborhood.id,
          title: input.data.title,
          description: input.data.description,
          priceTzs: input.data.priceTzs,
          minMonths: input.data.minMonths,
          luku: input.data.luku,
          water: input.data.water,
          phone,
          bedrooms: input.data.bedrooms,
          bathrooms: input.data.bathrooms,
          furnished: input.data.furnished,
          allowsPets: input.data.allowsPets,
          allowsStudents: input.data.allowsStudents,
          isAvailable: input.data.isAvailable,
          latitude: input.data.latitude ?? null,
          longitude: input.data.longitude ?? null,
          inspectionFeePolicyAcceptedAt: new Date(),
          expiresAt: listingExpiryFrom(),
          status: "APPROVED"
        },
        select: { id: true, status: true }
      });
    });
    if (!created) return NextResponse.json({ error: "Your subscription has expired. Pay TSh 5,000 before adding or editing a listing." }, { status: 403 });

    if (emailConfigured()) {
      try {
        await sendNewListingNotification({
          to: user.email,
          name: user.name,
          listingTitle: input.data.title,
          dashboardUrl: `${(process.env.APP_URL || "").replace(/\/$/, "")}/dalali`
        });
      } catch (error) {
        // The listing is already live; a failed email must not fail the request.
        console.error("New listing notification failed", error);
      }
    }

    return NextResponse.json({ listing: created }, { status: 201 });
  } catch (error) {
    if (error instanceof ListingInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    return authErrorResponse(error);
  }
}

class ListingInputError extends Error {}
