import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { setSecurityHeaders } from "@/lib/security";
import { completeSubscriptionPayment } from "@/lib/subscription-payments";
import { mapSonicPesaStatus, verifySonicPesaWebhook } from "@/lib/sonicpesa";

export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 64 * 1024;

const webhookSchema = z.object({
  event: z.string().optional(),
  order_id: z.string().min(1),
  amount: z.union([z.number(), z.string()]).optional(),
  currency: z.string().optional(),
  status: z.string().optional(),
  payment_status: z.string().optional(),
  transid: z.string().nullish(),
  channel: z.string().nullish(),
  reference: z.string().nullish(),
  msisdn: z.string().nullish(),
  timestamp: z.string().optional()
});

type WebhookEvent = z.infer<typeof webhookSchema>;

function acknowledged(extra: Record<string, unknown> = {}): NextResponse {
  return setSecurityHeaders(NextResponse.json({ received: true, ...extra }));
}

/** The provider sends both an `event` name and a status field; trust the name first. */
function paymentStateFor(event: WebhookEvent) {
  const eventName = (event.event || "").toLowerCase();
  if (eventName === "payment.success") return "PAID" as const;
  if (eventName === "payment.failed") return "FAILED" as const;
  if (eventName === "payment.cancelled" || eventName === "payment.canceled") return "CANCELLED" as const;
  return mapSonicPesaStatus(event.payment_status || event.status);
}

/** Agent subscription payment: verify the TSh 5,000 and activate the period. */
async function handleSubscriptionPayment(
  event: WebhookEvent,
  payment: { id: string; status: string; amountTzs: number }
) {
  if (payment.status === "VERIFIED") {
    return acknowledged({ ignored: "already_paid" });
  }

  const state = paymentStateFor(event);

  if (state === "PAID") {
    const paidAmount = Number(event.amount);
    if (!Number.isFinite(paidAmount) || Math.round(paidAmount) !== payment.amountTzs) {
      console.error("SonicPesa subscription amount mismatch", {
        orderId: event.order_id,
        expected: payment.amountTzs,
        received: event.amount
      });
      await prisma.paymentEvent.update({
        where: { id: payment.id },
        data: {
          status: "REJECTED",
          failureReason: "The amount confirmed by SonicPesa did not match the subscription price."
        }
      });
      return acknowledged({ ignored: "amount_mismatch" });
    }

    await completeSubscriptionPayment(payment.id);
    return acknowledged();
  }

  if (state === "PENDING") {
    return acknowledged({ ignored: "still_pending" });
  }

  await prisma.paymentEvent.update({
    where: { id: payment.id },
    data: {
      status: "REJECTED",
      failureReason:
        state === "CANCELLED"
          ? "The payment was cancelled on the phone."
          : "The provider reported a failed payment."
    }
  });
  return acknowledged();
}

/**
 * SonicPesa webhook for the agent subscription. Rent is paid directly to the
 * Agent on WhatsApp, so this application only ever verifies subscription
 * payments. The request is authenticated by the HMAC signature over the exact
 * raw body, so it is exempt from the browser same-origin check in
 * `middleware.ts`.
 */
export async function POST(request: NextRequest) {
  try {
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
      return NextResponse.json({ error: "Payload too large." }, { status: 413 });
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
      return NextResponse.json({ error: "Payload too large." }, { status: 413 });
    }

    const signature = request.headers.get("x-sonicpesa-signature");
    if (!verifySonicPesaWebhook(rawBody, signature)) {
      console.error("SonicPesa webhook signature verification failed");
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }

    const parsed = webhookSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
    }
    const event = parsed.data;

    const subscriptionPayment = await prisma.paymentEvent.findUnique({
      where: { providerOrderId: event.order_id },
      select: { id: true, status: true, amountTzs: true }
    });
    if (subscriptionPayment) return handleSubscriptionPayment(event, subscriptionPayment);

    // The order was not created by this application. Ask the provider to retry
    // in case the local record was written a moment after the order.
    console.error("SonicPesa webhook for unknown order", { orderId: event.order_id });
    return NextResponse.json({ error: "Unknown order." }, { status: 404 });
  } catch (error) {
    console.error("SonicPesa webhook processing failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Processing failed." }, { status: 500 });
  }
}
