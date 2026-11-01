import { NextRequest, NextResponse } from "next/server";
import { getListingDetail, recordListingView } from "@/lib/listing-detail";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ listingId: string }> }
) {
  try {
    if (!(await enforceRateLimit({
      scope: "listing-detail",
      clientId: clientIp(request.headers),
      limit: 60,
      windowSeconds: 60
    }))) {
      return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
    }
    const { listingId } = await context.params;
    const listing = await getListingDetail(listingId);
    if (!listing) {
      return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    }

    recordListingView(listing.id);

    return NextResponse.json({ listing });
  } catch (error) {
    console.error("Single listing fetch failed", error);
    return NextResponse.json({ error: "Listing is unavailable right now." }, { status: 503 });
  }
}
