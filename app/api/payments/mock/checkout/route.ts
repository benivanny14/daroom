import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { mockPaymentsEnabled } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { getPlanById } from "@/lib/subscriptions-plans";

export const dynamic = "force-dynamic";

/**
 * Simulates a successful Selcom redirect in development. It is only reachable
 * when PAYMENTS_MOCK="true" and NODE_ENV is not production, and it verifies
 * that the pending payment belongs to the signed-in Dalali.
 */
export async function GET(request: NextRequest) {
  if (!mockPaymentsEnabled()) {
    return NextResponse.redirect(new URL("/dalali?payment=unavailable", request.url));
  }

  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.redirect(new URL("/account?next=dalali", request.url));
    }
    throw error;
  }

  if (user.role !== "DALALI") {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  const reference = request.nextUrl.searchParams.get("reference");
  if (!reference) {
    return NextResponse.redirect(new URL("/dalali?payment=invalid", request.url));
  }

  const payment = await prisma.paymentEvent.findFirst({
    where: { reference, userId: user.id, provider: "SELCOM" }
  });
  if (!payment) {
    return NextResponse.redirect(new URL("/dalali?payment=invalid", request.url));
  }
  if (payment.status === "REJECTED") {
    return NextResponse.redirect(new URL("/dalali?payment=failed", request.url));
  }

  if (payment.status !== "VERIFIED") {
    const now = new Date();
    const plan = getPlanById(payment.plan) || getPlanById("BASIC");
    if (!plan) {
      return NextResponse.redirect(new URL("/dalali?payment=invalid", request.url));
    }
    await prisma.$transaction([
      prisma.paymentEvent.update({
        where: { id: payment.id },
        data: {
          status: "VERIFIED",
          signatureVerified: true,
          verifiedAt: now
        }
      }),
      prisma.subscription.create({
        data: {
          userId: user.id,
          plan: payment.plan,
          startsAt: now,
          endsAt: new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000),
          status: "ACTIVE"
        }
      })
    ]);
  }

  return NextResponse.redirect(new URL("/dalali?payment=success", request.url));
}
