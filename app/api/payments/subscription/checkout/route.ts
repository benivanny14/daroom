import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, authErrorResponse, requireUser } from "@/lib/auth";
import { readJsonBody } from "@/lib/http";
import { normalizeTanzaniaPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { completeSubscriptionPayment } from "@/lib/subscription-payments";
import { AGENT_PLAN, AGENT_PLAN_ID } from "@/lib/subscriptions-plans";
import {
  createSonicPesaOrder,
  getSonicPesaOrderStatus,
  isSonicPesaConfigured,
  SonicPesaError
} from "@/lib/sonicpesa";

export const dynamic = "force-dynamic";

const checkoutSchema = z.object({
  phone: z.string().trim().min(9).max(24).optional()
});

type PaymentRecord = {
  id: string;
  status: string;
  amountTzs: number;
  providerOrderId: string | null;
  failureReason: string | null;
  verifiedAt: Date | null;
};

function paymentResponse(payment: PaymentRecord) {
  return {
    id: payment.id,
    status: payment.status,
    amountTzs: payment.amountTzs,
    orderId: payment.providerOrderId,
    failureReason: payment.failureReason,
    verifiedAt: payment.verifiedAt
  };
}

function statusForOrder(state: string): "PENDING" | "VERIFIED" | "REJECTED" {
  if (state === "PAID") return "VERIFIED";
  if (state === "PENDING") return "PENDING";
  return "REJECTED";
}

/**
 * Starts the TSh 5,000 agent subscription payment with SonicPesa. The plan and
 * amount are fixed on the server; any client value is ignored.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    if (user.role !== "DALALI") {
      return NextResponse.json({ error: "This account cannot purchase an agent subscription." }, { status: 403 });
    }
    if (!isSonicPesaConfigured()) {
      return NextResponse.json({ error: "Mobile-money payments are not configured yet." }, { status: 503 });
    }
    if (!(await enforceRateLimit({
      scope: "subscription-checkout",
      clientId: `${user.id}:${clientIp(request.headers)}`,
      limit: 4,
      windowSeconds: 300
    }))) {
      return NextResponse.json({ error: "Wait a few minutes before starting another payment." }, { status: 429 });
    }

    const rawBody = await readJsonBody(request, 2 * 1024);
    if (!rawBody.ok) {
      return NextResponse.json({ error: "Invalid or oversized request data." }, { status: rawBody.status });
    }
    const body = checkoutSchema.safeParse(rawBody.value ?? {});
    if (!body.success) {
      return NextResponse.json({ error: "Enter a valid mobile-money number." }, { status: 400 });
    }

    const phone = normalizeTanzaniaPhone(body.data.phone || user.phone);
    if (!phone) {
      return NextResponse.json({ error: "Enter a valid Tanzanian mobile-money number." }, { status: 400 });
    }

    const reference = `${user.id}-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const payment = await prisma.paymentEvent.create({
      data: {
        userId: user.id,
        provider: "SONICPESA",
        reference,
        amountTzs: AGENT_PLAN.priceTzs,
        plan: AGENT_PLAN_ID,
        status: "PENDING"
      }
    });

    try {
      const order = await createSonicPesaOrder({
        buyerName: user.name,
        buyerEmail: user.email,
        buyerPhone: phone,
        amountTzs: AGENT_PLAN.priceTzs
      });
      const status = statusForOrder(order.status);

      await prisma.paymentEvent.update({
        where: { id: payment.id },
        data: {
          providerOrderId: order.orderId,
          status,
          failureReason: status === "REJECTED" ? "The provider did not accept the payment." : null
        }
      });

      if (status === "VERIFIED") {
        await completeSubscriptionPayment(payment.id);
      }

      const saved = await prisma.paymentEvent.findUniqueOrThrow({ where: { id: payment.id } });
      return NextResponse.json(
        {
          payment: paymentResponse(saved),
          message:
            status === "VERIFIED"
              ? "Payment received. Your subscription is active."
              : "A payment prompt was sent to your phone. Approve it with your mobile-money PIN."
        },
        { status: 201 }
      );
    } catch (error) {
      const reason = error instanceof SonicPesaError ? error.message : "The payment provider failed.";
      await prisma.paymentEvent.update({
        where: { id: payment.id },
        data: { status: "REJECTED", failureReason: reason.slice(0, 300) }
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
 * Returns the status of one of the agent's subscription payments. Pass
 * `refresh=1` to ask SonicPesa directly when the webhook has not arrived yet.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    if (user.role !== "DALALI") {
      return NextResponse.json({ error: "This account cannot purchase an agent subscription." }, { status: 403 });
    }

    const paymentId = request.nextUrl.searchParams.get("paymentId") || "";
    if (!paymentId) {
      return NextResponse.json({ error: "A payment id is required." }, { status: 400 });
    }

    let payment = await prisma.paymentEvent.findFirst({
      where: { id: paymentId, userId: user.id },
      select: {
        id: true,
        status: true,
        amountTzs: true,
        providerOrderId: true,
        failureReason: true,
        verifiedAt: true
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
          const status = statusForOrder(order.status);
          await prisma.paymentEvent.update({
            where: { id: payment.id },
            data: {
              status,
              failureReason:
                status === "REJECTED" ? "The provider reported an unsuccessful payment." : null
            }
          });
          if (status === "VERIFIED") {
            await completeSubscriptionPayment(payment.id);
          }
          payment = await prisma.paymentEvent.findFirstOrThrow({
            where: { id: payment.id },
            select: {
              id: true,
              status: true,
              amountTzs: true,
              providerOrderId: true,
              failureReason: true,
              verifiedAt: true
            }
          });
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
