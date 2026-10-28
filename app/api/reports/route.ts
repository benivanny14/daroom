import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { AuthError, assertSameOrigin, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashIp } from "@/lib/audit";
import { readJsonBody } from "@/lib/http";
import { notExpiredFilter } from "@/lib/listing-policy";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { REPORT_WINDOW_DAYS, reportFlagThreshold } from "@/lib/report-policy";
import { z } from "zod";

const categories = [
  "Listing is not real",
  "Price is incorrect",
  "Room has already been rented",
  "Room viewing fee"
];

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    if (!(await enforceRateLimit({
      scope: "listing-report",
      clientId: clientIp(request.headers),
      limit: 10,
      windowSeconds: 3600
    }))) {
      return NextResponse.json({ error: "You've submitted too many reports. Try again later." }, { status: 429 });
    }

    const rawBody = await readJsonBody(request, 8 * 1024);
    if (!rawBody.ok) return NextResponse.json({ error: "Report details are invalid or too large." }, { status: rawBody.status });
    const parsed = z.object({
      listingId: z.string().min(1).max(64),
      category: z.enum(categories as [string, ...string[]]),
      details: z.string().max(500).default("")
    }).safeParse(rawBody.value);
    if (!parsed.success) return NextResponse.json({ error: "Please check your report details." }, { status: 400 });

    const listing = await prisma.listing.findFirst({
      where: { id: parsed.data.listingId, status: "APPROVED", AND: [notExpiredFilter()] },
      select: { id: true }
    });
    if (!listing) return NextResponse.json({ error: "Listing not found or already hidden." }, { status: 404 });

    const sessionUser = await getSessionUser();
    const reporterIpHash = hashIp(clientIp(request.headers));
    const windowStart = new Date(Date.now() - REPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const duplicate = await prisma.report.findFirst({
      where: {
        listingId: listing.id,
        createdAt: { gte: windowStart },
        OR: [
          ...(sessionUser ? [{ reporterId: sessionUser.id }] : []),
          { reporterIpHash }
        ]
      },
      select: { id: true }
    });
    if (duplicate) {
      return NextResponse.json({
        ok: true,
        alreadyReported: true,
        message: "We've already received your report about this listing. Our team is reviewing it."
      });
    }

    const threshold = reportFlagThreshold();
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const report = await tx.report.create({
        data: {
          listingId: listing.id,
          reporterId: sessionUser?.id || null,
          reporterIpHash,
          category: parsed.data.category,
          details: parsed.data.details.trim()
        },
        select: { id: true }
      });

      const distinctReports = await tx.report.count({
        where: {
          listingId: listing.id,
          status: "OPEN",
          createdAt: { gte: windowStart }
        }
      });

      let flagged = false;
      if (distinctReports >= threshold) {
        const changed = await tx.listing.updateMany({
          where: { id: listing.id, status: "APPROVED" },
          data: { status: "FLAGGED" }
        });
        flagged = changed.count === 1;
      }

      return { report, distinctReports, flagged };
    });

    return NextResponse.json({
      ok: true,
      report: { id: result.report.id },
      flagged: result.flagged,
      message: result.flagged
        ? "Thank you. The listing has been placed under priority review."
        : "Thank you. We've received your report; our team will review it."
    }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Public report submission failed", error);
    return NextResponse.json({ error: "Report could not be submitted right now." }, { status: 503 });
  }
}
