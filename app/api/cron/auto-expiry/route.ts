import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteMediaObject, listMediaObjects } from "@/lib/storage";
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

    // Delete uploads that were signed but never confirmed. A signed Supabase
    // URL cannot enforce a byte limit, so an abandoned or rejected upload would
    // otherwise sit in the bucket forever. Only objects older than 24 hours are
    // considered, so an upload still in progress is never removed.
    const mediaCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const mediaObjects = await listMediaObjects("listings/");
    const mediaCandidates = mediaObjects
      .filter((object) => object.createdAt && object.createdAt < mediaCutoff)
      .slice(0, 2000);
    // Resolve every candidate against the database in one query, so an old but
    // attached photo cannot hide an orphan that sits later in the list.
    const attachedRows = mediaCandidates.length
      ? await prisma.listingPhoto.findMany({
          where: { storageKey: { in: mediaCandidates.map((object) => object.key) } },
          select: { storageKey: true }
        })
      : [];
    const attachedKeys = new Set(attachedRows.map((row) => row.storageKey));
    const orphans = mediaCandidates
      .filter((object) => !attachedKeys.has(object.key))
      .slice(0, 40);
    let mediaDeleted = 0;
    for (const object of orphans) {
      try {
        await deleteMediaObject(object.key);
        mediaDeleted += 1;
      } catch {
        // A failed delete is retried on the next run.
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
      mediaDeleted,
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
