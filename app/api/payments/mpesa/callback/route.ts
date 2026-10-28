import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMpesaCallback } from "@/lib/mpesa";
import { setSecurityHeaders } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("x-mpesa-signature") || "";

    if (!verifyMpesaCallback(body, signature)) {
      console.error("M-Pesa callback verification failed");
      return NextResponse.json({ error: "Verification failed" }, { status: 400 });
    }

    const data = JSON.parse(body);
    const { Body } = data;
    const { stkCallback } = Body;
    const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stkCallback;

    if (ResultCode !== 0) {
      console.error("M-Pesa payment failed", { ResultCode, ResultDesc });
      return NextResponse.json({ error: "Payment failed" }, { status: 400 });
    }

    const amount = CallbackMetadata.Item.find((item: any) => item.Name === "Amount")?.Value;
    const mpesaReceipt = CallbackMetadata.Item.find((item: any) => item.Name === "MpesaReceiptNumber")?.Value;
    const phoneNumber = CallbackMetadata.Item.find((item: any) => item.Name === "PhoneNumber")?.Value;

    // Create payment event
    await prisma.paymentEvent.create({
      data: {
        userId: CheckoutRequestID.split("-")[0],
        provider: "mpesa",
        providerEventId: mpesaReceipt,
        reference: CheckoutRequestID,
        amountTzs: amount,
        status: "VERIFIED",
        signatureVerified: true,
        verifiedAt: new Date()
      }
    });

    // Activate subscription
    const user = await prisma.user.findUnique({
      where: { id: CheckoutRequestID.split("-")[0] }
    });

    if (user) {
      const now = new Date();
      const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      await prisma.subscription.create({
        data: {
          userId: user.id,
          plan: "BASIC",
          startsAt: now,
          endsAt,
          status: "ACTIVE"
        }
      });
    }

    const response = NextResponse.json({ success: true });
    return setSecurityHeaders(response);
  } catch (error) {
    console.error("M-Pesa callback processing failed", error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
