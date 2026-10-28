import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, authErrorResponse, requireUser } from "@/lib/auth";
import { readJsonBody } from "@/lib/http";
import { normalizeTanzaniaPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import {
  createSonicPesaOrder,
  getSonicPesaOrderStatus,
  isSonicPesaConfigured,
  SonicPesaError
} from "@/lib/sonicpesa";

export const dynamic = "force-dynamic";

const checkoutSchema = z.object({
  amount: z.coerce.number().int().min(1_000).max(10_000_000),
  phoneNumber: z.string().trim().min(9).max(24),
  tenantId: z.string().trim().min(1).max(64).optional(),
  rentId: z.string().trim().min(1).max(120).optional(),
  listingId: z.string().trim().min(1).max(64).optional()
});

function paymentResponse(payment: {
  id: string;
  status: string;
  amountTzs: number;
  providerOrderId: string | null;
  paidAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
}) {
  return {
    id: payment.id,
    status: payment.status,
    amountTzs: payment.amountTzs,
    orderId: payment.providerOrderId,
    paidAt: payment.paidAt,
    failureReason: payment.failureReason,
    createdAt: payment.createdAt
  };
}

/**
 * Starts a mobile-money rent payment. The tenant is always taken from the
 * session; a `tenantId` in the body may only repeat that same id.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    if (user.role !== "TENANT") {
      return NextResponse.json({ error: "Only tenant accounts can pay rent." }, { status: 403 });
    }
    if (!isSonicPesaConfigured()) {
      return NextResponse.json({ error: "Mobile-money payments are not configured yet." }, { status: 503 });
    }
    if (!(await enforceRateLimit({
      scope: "rent-checkout",
      clientId: `${user.id}:${clientIp(request.headers)}`,
      limit: 5,
      windowSeconds: 600
    }))) {
      return NextResponse.json({ error: "Wait a few minutes before starting another payment." }, { status: 429 });
    }

    const rawBody = await readJsonBody(request, 8 * 1024);
    if (!rawBody.ok) {
      return NextResponse.json({ error: "Invalid or oversized request data." }, { status: rawBody.status });
    }
    const body = checkoutSchema.safeParse(rawBody.value);
    if (!body.success) {
      return NextResponse.json(
        { error: "Enter a valid amount (TSh 1,000 to TSh 10,000,000), phone number and room." },
        { status: 400 }
      );
    }
    if (body.data.tenantId && body.data.tenantId !== user.id) {
      return NextResponse.json({ error: "You can only pay rent from your own account." }, { status: 403 });
    }

    const phone = normalizeTanzaniaPhone(body.data.phoneNumber);
    if (!phone) {
      return NextResponse.json({ error: "Enter a valid Tanzanian mobile-money number." }, { status: 400 });
    }

    const listing = body.data.listingId
      ? await prisma.listing.findUnique({
          where: { id: body.data.listingId },
          select: { id: true, title: true }
        })
      : null;
    if (body.data.listingId && !listing) {
      return NextResponse.json({ error: "The selected room was not found." }, { status: 400 });
    }

    const payment = await prisma.rentPayment.create({
      data: {
        tenantId: user.id,
        listingId: listing?.id,
        rentReference: body.data.rentId,
        amountTzs: body.data.amount,
        phone,
        status: "PENDING"
      }
    });

    try {
      const order = await createSonicPesaOrder({
        buyerName: user.name,
        buyerEmail: user.email,
        buyerPhone: phone,
        amountTzs: body.data.amount
      });

      const updated = await prisma.rentPayment.update({
        where: { id: payment.id },
        data: {
          providerOrderId: order.orderId,
          providerReference: order.providerReference,
          providerTransId: order.transId,
          channel: order.channel,
          status: order.status,
          paidAt: order.status === "PAID" ? new Date() : null,
          rawPayload: order.raw as Prisma.InputJsonValue
        }
      });

      return NextResponse.json(
        {
          payment: paymentResponse(updated),
          message:
            updated.status === "PAID"
              ? "Payment received. Thank you."
              : "A payment prompt was sent to your phone. Approve it with your mobile-money PIN."
        },
        { status: 201 }
      );
    } catch (error) {
      const reason = error instanceof SonicPesaError ? error.message : "The payment provider failed.";
      await prisma.rentPayment.update({
        where: { id: payment.id },
        data: { status: "FAILED", failureReason: reason.slice(0, 300) }
      });
      if (error instanceof SonicPesaError) {
        return NextResponse.json({ error: error.message, paymentId: payment.id }, { status: error.status });
      }
      throw error;
    }
  } catch (error) {
    return authErrorResponse(error);
  }
}

/**
 * Returns the current status of one of the tenant's payments. Pass `refresh=1`
 * to ask SonicPesa directly when a webhook has not arrived yet.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    if (user.role !== "TENANT") {
      return NextResponse.json({ error: "Only tenant accounts can pay rent." }, { status: 403 });
    }

    const paymentId = request.nextUrl.searchParams.get("paymentId") || "";
    if (!paymentId) {
      return NextResponse.json({ error: "A payment id is required." }, { status: 400 });
    }

    const payment = await prisma.rentPayment.findFirst({
      where: { id: paymentId, tenantId: user.id },
      select: {
        id: true,
        status: true,
        amountTzs: true,
        providerOrderId: true,
        paidAt: true,
        failureReason: true,
        createdAt: true
      }
    });
    if (!payment) {
      return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    }

    if (
      request.nextUrl.searchParams.get("refresh") === "1" &&
      payment.status === "PENDING" &&
      payment.providerOrderId
    ) {
      try {
        const order = await getSonicPesaOrderStatus(payment.providerOrderId);
        if (order.status !== "PENDING") {
          const updated = await prisma.rentPayment.update({
            where: { id: payment.id },
            data: {
              status: order.status,
              paidAt: order.status === "PAID" ? new Date() : null,
              failureReason: order.status === "FAILED" ? "The provider reported a failed payment." : null,
              providerTransId: order.transId,
              channel: order.channel,
              rawPayload: order.raw as Prisma.InputJsonValue
            }
          });
          return NextResponse.json({ payment: paymentResponse(updated) });
        }
      } catch (error) {
        // The stored webhook state is still valid; a failed poll must not hide it.
        console.error("SonicPesa status refresh failed", error instanceof Error ? error.message : "unknown");
      }
    }

    return NextResponse.json({ payment: paymentResponse(payment) });
  } catch (error) {
    return authErrorResponse(error);
  }
}
