import { prisma } from "@/lib/prisma";
import { nextSubscriptionEnd } from "@/lib/subscriptions";

/**
 * Marks a SonicPesa subscription payment as verified and grants (or extends)
 * the agent's subscription. Safe to call twice: an already verified payment is
 * returned without creating a second period.
 */
export async function completeSubscriptionPayment(paymentId: string) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.paymentEvent.findUnique({ where: { id: paymentId } });
    if (!payment) return null;
    if (payment.status === "VERIFIED") return payment;

    const now = new Date();
    const current = await tx.subscription.findFirst({
      where: { userId: payment.userId },
      orderBy: { endsAt: "desc" },
      select: { endsAt: true }
    });

    const verified = await tx.paymentEvent.update({
      where: { id: payment.id },
      data: {
        status: "VERIFIED",
        signatureVerified: true,
        verifiedAt: now,
        failureReason: null
      }
    });

    await tx.subscription.create({
      data: {
        userId: payment.userId,
        plan: payment.plan,
        startsAt: now,
        endsAt: nextSubscriptionEnd(current?.endsAt, now),
        status: "ACTIVE"
      }
    });

    return verified;
  });
}
