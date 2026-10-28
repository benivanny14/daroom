import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { AuthError, assertSameOrigin, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/http";
import { recordAdminAudit } from "@/lib/audit";
import { clientIp } from "@/lib/rate-limit";
import { z } from "zod";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const cursor = new URL(request.url).searchParams.get("cursor")?.trim() || null;
    const reports = await prisma.report.findMany({
      where: { status: { in: ["OPEN", "REVIEWED"] } },
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        listing: {
          select: {
            id: true,
            title: true,
            status: true,
            phone: true,
            owner: { select: { id: true, name: true, phone: true, email: true } },
            neighborhood: { select: { name: true } },
            district: { select: { name: true } }
          }
        }
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 201,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    const hasMore = reports.length > 200;
    const page = hasMore ? reports.slice(0, 200) : reports;
    return NextResponse.json({
      reports: page,
      nextCursor: hasMore && page.length ? page[page.length - 1].id : null
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Admin report queue failed", error);
    return NextResponse.json({ error: "The report queue is unavailable." }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const rawBody = await readJsonBody(request, 2 * 1024);
    if (!rawBody.ok) return NextResponse.json({ error: "The data is invalid or too large." }, { status: rawBody.status });
    const body = z.object({
      reportId: z.string().min(1).max(64),
      action: z.enum(["dismiss", "confirm"])
    }).safeParse(rawBody.value);
    if (!body.success) return NextResponse.json({ error: "The report data is invalid." }, { status: 400 });

    const report = await prisma.report.findUnique({
      where: { id: body.data.reportId },
      select: { id: true, listingId: true, status: true }
    });
    if (!report) return NextResponse.json({ error: "The report does not exist." }, { status: 404 });
    const actionable = body.data.action === "confirm"
      ? report.status === "OPEN"
      : report.status === "OPEN" || report.status === "REVIEWED";
    if (!actionable) return NextResponse.json({ error: body.data.action === "confirm" ? "The report does not exist or has already been reviewed." : "The report does not exist or has already been dismissed." }, { status: 404 });
    let restoredListing = false;
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.report.update({
        where: { id: report.id },
        data: { status: body.data.action === "dismiss" ? "DISMISSED" : "REVIEWED", reviewedAt: new Date() }
      });
      const otherOpen = await tx.report.count({
        where: { listingId: report.listingId, status: "OPEN", id: { not: report.id } }
      });
      if (body.data.action === "confirm") {
        await tx.listing.updateMany({
          where: { id: report.listingId, status: "APPROVED" },
          data: { status: "FLAGGED" }
        });
      } else if (otherOpen === 0) {
        const changed = await tx.listing.updateMany({
          where: { id: report.listingId, status: "FLAGGED" },
          data: { status: "APPROVED" }
        });
        restoredListing = changed.count === 1;
      }
    });
    await recordAdminAudit({
      actorId: admin.id,
      action: `report.${body.data.action}`,
      targetType: "report",
      targetId: report.id,
      summary: `${body.data.action === "dismiss" ? "Dismissed" : "Confirmed"} a listing report${restoredListing ? " and restored the listing" : ""}`,
      metadata: { listingId: report.listingId },
      ip: clientIp(request.headers)
    });
    return NextResponse.json({ ok: true, listingRestored: restoredListing });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Admin report review failed", error);
    return NextResponse.json({ error: "The report could not be reviewed." }, { status: 503 });
  }
}
