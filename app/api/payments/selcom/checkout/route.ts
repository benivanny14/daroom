import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, authErrorResponse, requireUser } from "@/lib/auth";
import { normalizeTanzaniaPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { createSelcomCheckout } from "@/lib/selcom";
import { readJsonBody } from "@/lib/http";
import { getPlanById } from "@/lib/subscriptions-plans";
import { mockPaymentsEnabled } from "@/lib/payments";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    if (user.role !== "DALALI") {
      return NextResponse.json({ error: "This account cannot purchase an agent subscription." }, { status: 403 });
    }
    if (!(await enforceRateLimit({
      scope: "payment-checkout",
      clientId: `${user.id}:${clientIp(request.headers)}`,
      limit: 4,
      windowSeconds: 300
    }))) {
      return NextResponse.json({ error: "Wait a few minutes before starting another payment." }, { status: 429 });
    }

    const rawBody = await readJsonBody(request, 2 * 1024);
    if (!rawBody.ok) return NextResponse.json({ error: "Invalid or oversized request data." }, { status: rawBody.status });
    const body = z.object({
      phone: z.string().min(9).max(24),
      plan: z.enum(["BASIC", "PREMIUM", "FEATURED"]).optional().default("BASIC")
    }).safeParse(rawBody.value);
    const phone = body.success ? normalizeTanzaniaPhone(body.data.phone) : null;
    if (!phone || !body.success) return NextResponse.json({ error: "Enter a valid Tanzanian phone number for payment." }, { status: 400 });

    const planConfig = getPlanById(body.data.plan);
    const amountTzs = planConfig ? planConfig.priceTzs : 5_000;
    const reference = `${user.id}-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const baseUrl = process.env.APP_URL || "http://localhost:3000";
    const payment = await prisma.paymentEvent.create({
      data: {
        userId: user.id,
        provider: "SELCOM",
        reference,
        amountTzs,
        plan: body.data.plan,
        status: "PENDING"
      }
    });

    if (mockPaymentsEnabled()) {
      const mockUrl = new URL("/api/payments/mock/checkout", baseUrl);
      mockUrl.searchParams.set("reference", reference);
      await prisma.paymentEvent.update({
        where: { id: payment.id },
        data: { checkoutUrl: mockUrl.toString() }
      });
      return NextResponse.json({ checkoutUrl: mockUrl.toString(), reference, mock: true });
    }

    try {
      const checkoutUrl = await createSelcomCheckout({
        order_id: reference,
        buyer_email: user.email,
        buyer_name: user.name,
        buyer_phone: phone,
        amount: amountTzs,
        currency: "TZS",
        redirect_url: `${baseUrl}/dalali?payment=pending`,
        cancel_url: `${baseUrl}/dalali?payment=cancelled`,
        webhook: `${baseUrl}/api/payments/selcom/callback`,
        no_of_items: 1
      });
      await prisma.paymentEvent.update({
        where: { id: payment.id },
        data: { checkoutUrl }
      });
      return NextResponse.json({ checkoutUrl, reference });
    } catch (error) {
      await prisma.paymentEvent.update({
        where: { id: payment.id },
        data: { status: "REJECTED" }
      });
      throw error;
    }
  } catch (error) {
    return authErrorResponse(error);
  }
}
