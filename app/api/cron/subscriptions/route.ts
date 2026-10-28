import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sendExpiryReminder } from "@/lib/email";
import { prisma } from "@/lib/prisma";

function validCronToken(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const actual = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return actual.length === expected.length && timingSafeEqual(
    createHmac("sha256", secret).update(actual).digest(),
    createHmac("sha256", secret).update(expected).digest()
  );
}

async function run(request: NextRequest) {
  if (!validCronToken(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const now = new Date();
  const reminderCutoff = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const expired = await prisma.subscription.updateMany({
    where: { status: "ACTIVE", endsAt: { lte: now } },
    data: { status: "EXPIRED" }
  });
  await prisma.rateLimitBucket.deleteMany({
    where: { updatedAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } }
  });
  const due = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      reminderSentAt: null,
      endsAt: { gt: now, lte: reminderCutoff }
    },
    select: {
      id: true,
      endsAt: true,
      user: { select: { email: true, name: true } }
    },
    take: 500
  });

  let sent = 0;
  let failed = 0;
  for (const subscription of due) {
    const claimedAt = new Date();
    const claim = await prisma.subscription.updateMany({
      where: {
        id: subscription.id,
        status: "ACTIVE",
        reminderSentAt: null,
        endsAt: { gt: claimedAt }
      },
      data: { reminderSentAt: claimedAt }
    });
    if (claim.count !== 1) continue;

    try {
      await sendExpiryReminder({
        to: subscription.user.email,
        name: subscription.user.name,
        renewUrl: `${process.env.APP_URL || "http://localhost:3000"}/dalali`
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error("Subscription reminder email failed", {
        subscriptionId: subscription.id,
        error
      });
      await prisma.subscription.updateMany({
        where: { id: subscription.id, reminderSentAt: claimedAt },
        data: { reminderSentAt: null }
      });
    }
  }
  return NextResponse.json({ expired: expired.count, sent, failed });
}

export async function POST(request: NextRequest) {
  return run(request);
}

// Hosted cron services call these endpoints with GET.
export async function GET(request: NextRequest) {
  return run(request);
}
