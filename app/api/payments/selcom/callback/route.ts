import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySelcomCallback } from "@/lib/selcom";
import { setSecurityHeaders } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const headers = request.headers;

    const verifiedPayload = verifySelcomCallback(rawBody, headers);
    if (!verifiedPayload) {
      console.error("Selcom callback verification failed");
      return NextResponse.json({ error: "Verification failed" }, { status: 400 });
    }

    const order_id = verifiedPayload.order_id as string;
    const result = verifiedPayload.result as string;
    const resultcode = verifiedPayload.resultcode as string;
    const amount = Number(verifiedPayload.amount);
    const transid = verifiedPayload.transid as string || verifiedPayload.transaction_id as string;

    if (!["SUCCESS", "000"].includes(result || resultcode || "")) {
      console.error("Selcom payment failed", { order_id, result, resultcode });
      return NextResponse.json({ error: "Payment failed" }, { status: 400 });
    }

    // Check if this payment event has already been processed
    const existingByEventId = await prisma.paymentEvent.findUnique({
      where: { providerEventId: transid }
    });

    if (existingByEventId && existingByEventId.status === "VERIFIED") {
      return NextResponse.json({ success: true });
    }

    // Look up pending PaymentEvent by order_id (reference) or fallback to prefix userId
    const pendingPayment = await prisma.paymentEvent.findUnique({
      where: { reference: order_id }
    });

    const userId = pendingPayment ? pendingPayment.userId : order_id.split("-")[0];
    const plan = pendingPayment ? pendingPayment.plan : (amount >= 30000 ? "FEATURED" : amount >= 15000 ? "PREMIUM" : "BASIC");

    if (pendingPayment) {
      await prisma.paymentEvent.update({
        where: { id: pendingPayment.id },
        data: {
          providerEventId: transid,
          amountTzs: amount,
          status: "VERIFIED",
          signatureVerified: true,
          verifiedAt: new Date()
        }
      });
    } else {
      await prisma.paymentEvent.create({
        data: {
          userId,
          provider: "selcom",
          providerEventId: transid,
          reference: order_id || transid,
          amountTzs: amount,
          plan,
          status: "VERIFIED",
          signatureVerified: true,
          verifiedAt: new Date()
        }
      });
    }

    // Activate subscription
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (user) {
      const now = new Date();
      const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

      await prisma.subscription.create({
        data: {
          userId: user.id,
          plan,
          startsAt: now,
          endsAt,
          status: "ACTIVE"
        }
      });
    }

    const response = NextResponse.json({ success: true });
    return setSecurityHeaders(response);
  } catch (error) {
    console.error("Selcom callback processing failed", error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
