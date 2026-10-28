import { NextRequest, NextResponse } from "next/server";
import { AuthError, assertSameOrigin } from "@/lib/auth";
import { readJsonBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ listingId: string }> }
) {
  try {
    assertSameOrigin(request);
    if (!(await enforceRateLimit({
      scope: "listing-track",
      clientId: clientIp(request.headers),
      limit: 120,
      windowSeconds: 60
    }))) {
      return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
    }
    const { listingId } = await context.params;
    const rawBody = await readJsonBody(request, 4 * 1024);
    if (!rawBody.ok) return NextResponse.json({ error: "The event data is invalid or too large." }, { status: rawBody.status });
    const body = rawBody.value as { event?: unknown };
    const event =
      body?.event === "inquiry"
        ? "inquiry"
        : body?.event === "whatsapp"
          ? "whatsapp"
          : null;
    if (!event) return NextResponse.json({ error: "Unknown event." }, { status: 400 });
    const listing = await prisma.listing.findFirst({
      where: { id: listingId, status: "APPROVED", isAvailable: true },
      select: { id: true }
    });
    if (!listing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });

    await prisma.listingAnalytics.upsert({
      where: { listingId },
      update: event === "whatsapp"
        ? { whatsappClicks: { increment: 1 } }
        : { inquiries: { increment: 1 } },
      create: {
        listingId,
        views: 1,
        whatsappClicks: event === "whatsapp" ? 1 : 0,
        favorites: 0,
        inquiries: event === "inquiry" ? 1 : 0
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Listing event tracking failed", error);
    return NextResponse.json({ error: "Stats could not be saved." }, { status: 503 });
  }
}
