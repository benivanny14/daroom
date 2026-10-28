import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    if (!(await enforceRateLimit({
      scope: "geography",
      clientId: clientIp(request.headers),
      limit: 60,
      windowSeconds: 60
    }))) {
      return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
    }
    const region = await prisma.region.findUnique({
      where: { name: "Dar es Salaam" },
      select: {
        id: true,
        name: true,
        districts: {
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            neighborhoods: { orderBy: { name: "asc" }, select: { id: true, name: true } }
          }
        }
      }
    });
    const response = NextResponse.json({ region });
    // Geography data changes a few times a year: let browsers reuse it.
    response.headers.set("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=3600");
    return response;
  } catch (error) {
    console.error("Geography query failed", error);
    return NextResponse.json({ error: "Areas are unavailable right now." }, { status: 503 });
  }
}
