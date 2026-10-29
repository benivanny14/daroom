import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, authErrorResponse, getSessionUser, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/http";
import { normalizeTanzaniaPhone } from "@/lib/phone";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { withRateLimit } from "@/lib/rate-limit-middleware";
import { setSecurityHeaders } from "@/lib/security";
import { notExpiredFilter } from "@/lib/listing-policy";
import { getMediaUrl } from "@/lib/storage";
import { z } from "zod";

export const dynamic = "force-dynamic";

const MAX_ADVANCE_MS = 365 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      const user = await requireUser();
      const appointments = await prisma.viewingAppointment.findMany({
        where: { userId: user.id },
        include: {
          listing: {
            select: {
              id: true,
              title: true,
              priceTzs: true,
              isAvailable: true,
              district: { select: { name: true } },
              neighborhood: { select: { name: true } },
              photos: { select: { id: true, storageKey: true, altText: true }, orderBy: { createdAt: "asc" }, take: 1 }
            }
          }
        },
        orderBy: { scheduledAt: "desc" },
        take: 100
      });

      return setSecurityHeaders(NextResponse.json({
        appointments: appointments.map((appointment) => ({
          id: appointment.id,
          scheduledAt: appointment.scheduledAt,
          status: appointment.status,
          notes: appointment.notes,
          tenantName: appointment.tenantName,
          tenantPhone: appointment.tenantPhone,
          listing: {
            id: appointment.listing.id,
            title: appointment.listing.title,
            priceTzs: appointment.listing.priceTzs,
            isAvailable: appointment.listing.isAvailable,
            district: appointment.listing.district.name,
            neighborhood: appointment.listing.neighborhood.name,
            photo: appointment.listing.photos[0]
              ? getMediaUrl(appointment.listing.photos[0].storageKey)
              : null
          }
        }))
      }));
    } catch (error) {
      return authErrorResponse(error);
    }
  });
}

export async function POST(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      assertSameOrigin(request);
      // Booking does not need an account, so each address gets a tight budget
      // of its own: an agent's phone and inbox must not be floodable.
      if (!(await enforceRateLimit({
        scope: "create-appointment",
        clientId: clientIp(request.headers),
        limit: 5,
        windowSeconds: 3600
      }))) {
        return NextResponse.json({ error: "You've booked several viewings already. Try again later." }, { status: 429 });
      }
      const rawBody = await readJsonBody(request, 4 * 1024);
      if (!rawBody.ok) {
        return NextResponse.json({ error: "Invalid request or data too large." }, { status: rawBody.status });
      }
      const body = z.object({
        listingId: z.string().min(1).max(64),
        tenantName: z.string().trim().min(2).max(80),
        tenantPhone: z.string().min(9).max(24),
        tenantEmail: z.string().trim().email().max(254).optional().or(z.literal("")),
        scheduledAt: z.string().min(1).max(40),
        notes: z.string().trim().max(500).optional()
      }).safeParse(rawBody.value);

      if (!body.success) {
        return NextResponse.json({ error: "Enter your name, phone, and viewing time." }, { status: 400 });
      }

      const phone = normalizeTanzaniaPhone(body.data.tenantPhone);
      if (!phone) {
        return NextResponse.json({ error: "Enter a valid Tanzanian phone number." }, { status: 400 });
      }

      const scheduledAt = new Date(body.data.scheduledAt);
      const now = Date.now();
      if (
        Number.isNaN(scheduledAt.getTime()) ||
        scheduledAt.getTime() <= now ||
        scheduledAt.getTime() > now + MAX_ADVANCE_MS
      ) {
        return NextResponse.json({ error: "Choose a future time within one year." }, { status: 400 });
      }

      const listing = await prisma.listing.findFirst({
        where: { id: body.data.listingId, status: "APPROVED", isAvailable: true, AND: [notExpiredFilter()] },
        include: { owner: { select: { email: true, name: true } } }
      });

      if (!listing) {
        return NextResponse.json({ error: "Listing not found." }, { status: 404 });
      }

      const sessionUser = await getSessionUser();
      if (sessionUser) {
        const duplicate = await prisma.viewingAppointment.findFirst({
          where: {
            userId: sessionUser.id,
            listingId: listing.id,
            scheduledAt,
            status: { in: ["PENDING", "CONFIRMED"] }
          },
          select: { id: true }
        });
        if (duplicate) {
          return NextResponse.json({ error: "You've already booked a viewing for this time." }, { status: 400 });
        }
      } else {
        // Same phone, same room, same day: a guest cannot stack bookings.
        const duplicate = await prisma.viewingAppointment.findFirst({
          where: {
            userId: null,
            listingId: listing.id,
            tenantPhone: phone,
            status: { in: ["PENDING", "CONFIRMED"] },
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
          },
          select: { id: true }
        });
        if (duplicate) {
          return NextResponse.json({
            error: "You already have a viewing booked for this room. Cancel it first or log in to manage it."
          }, { status: 400 });
        }
      }

      const appointment = await prisma.viewingAppointment.create({
        data: {
          listingId: listing.id,
          userId: sessionUser?.id || null,
          tenantName: body.data.tenantName,
          tenantPhone: phone,
          tenantEmail: body.data.tenantEmail || sessionUser?.email || null,
          scheduledAt,
          notes: body.data.notes || null,
          // Viewings are booked immediately: no agent approval step.
          status: "CONFIRMED"
        }
      });

      await prisma.listingAnalytics.upsert({
        where: { listingId: listing.id },
        update: { inquiries: { increment: 1 } },
        create: { listingId: listing.id, views: 0, whatsappClicks: 0, favorites: 0, inquiries: 1 }
      });

      if (process.env.RESEND_API_KEY) {
        const { sendViewingReminder } = await import("@/lib/email");
        sendViewingReminder({
          to: listing.owner.email,
          name: listing.owner.name,
          listingTitle: listing.title,
          date: scheduledAt.toLocaleDateString("en-GB")
        }).catch((error) => console.error("Viewing reminder email failed", error));
      }

      return setSecurityHeaders(NextResponse.json({
        appointment: {
          id: appointment.id,
          scheduledAt: appointment.scheduledAt,
          status: appointment.status
        }
      }));
    } catch (error) {
      return authErrorResponse(error);
    }
  });
}
