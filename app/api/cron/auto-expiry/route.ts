import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeCompare } from "@/lib/security";

export const dynamic = "force-dynamic";

async function run(request: NextRequest) {
  try {
    // Schedulers differ: some send `x-cron-secret`, hosted cron jobs send
    // `Authorization: Bearer <CRON_SECRET>`. Both must match the same secret.
    const bearer = request.headers.get("authorization");
    const cronSecret = request.headers.get("x-cron-secret")
      || (bearer?.startsWith("Bearer ") ? bearer.slice(7) : null);
    if (!process.env.CRON_SECRET || !cronSecret || !timingSafeCompare(cronSecret, process.env.CRON_SECRET)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();

    // Auto-expire featured listings
    const expiredFeatured = await prisma.listing.updateMany({
      where: {
        isFeatured: true,
        featuredUntil: { lt: now }
      },
      data: {
        isFeatured: false,
        featuredUntil: null
      }
    });

    // Auto-expire listings whose 60-day window has ended
    const expiredListings = await prisma.listing.updateMany({
      where: {
        status: "APPROVED",
        expiresAt: { lt: now }
      },
      data: {
        status: "EXPIRED"
      }
    });

    // Auto-expire subscriptions
    const expiredSubscriptions = await prisma.subscription.updateMany({
      where: {
        status: "ACTIVE",
        endsAt: { lt: now }
      },
      data: {
        status: "EXPIRED"
      }
    });

    // Send expiry reminders (day 27)
    const reminderSubscriptions = await prisma.subscription.findMany({
      where: {
        status: "ACTIVE",
        endsAt: {
          gte: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
          lte: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000)
        },
        reminderSentAt: null
      },
      include: {
        user: true
      }
    });

    if (process.env.RESEND_API_KEY) {
      const { sendExpiryReminder } = await import("@/lib/email");
      for (const sub of reminderSubscriptions) {
        await sendExpiryReminder({
          to: sub.user.email,
          name: sub.user.name,
          renewUrl: `${process.env.APP_URL}/dalali`
        });
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { reminderSentAt: now }
        });
      }
    }

    // Remove stale rate-limit buckets (kept 24h for diagnostics)
    const staleBuckets = await prisma.rateLimitBucket.deleteMany({
      where: {
        updatedAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) }
      }
    });

    const response = NextResponse.json({
      success: true,
      expiredFeatured: expiredFeatured.count,
      expiredListings: expiredListings.count,
      expiredSubscriptions: expiredSubscriptions.count,
      remindersSent: reminderSubscriptions.length,
      staleRateLimitBuckets: staleBuckets.count
    });

    return response;
  } catch (error) {
    console.error("Auto-expiry cron failed", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return run(request);
}

// Hosted cron services call these endpoints with GET.
export async function GET(request: NextRequest) {
  return run(request);
}
