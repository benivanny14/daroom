import { AuthError, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMediaUrl } from "@/lib/storage";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const cursor = new URL(request.url).searchParams.get("cursor")?.trim() || null;
    const users = await prisma.user.findMany({
      where: { role: "DALALI", isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        subscriptions: { orderBy: { endsAt: "desc" }, take: 1, select: { status: true, endsAt: true, plan: true } },
        idVerification: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, documentType: true, documentUrl: true, status: true, rejectedReason: true, createdAt: true } },
        _count: { select: { listings: true } }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 201,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    const hasMore = users.length > 200;
    const page = hasMore ? users.slice(0, 200) : users;
    return NextResponse.json({
      nextCursor: hasMore && page.length ? page[page.length - 1].id : null,
      dalalis: page.map((user) => {
        const verification = user.idVerification[0] || null;
        return {
          ...user,
          subscription: user.subscriptions[0] || null,
          verification: verification
            ? {
                ...verification,
                url: getMediaUrl(verification.documentUrl)
              }
            : null,
          subscriptions: undefined,
          idVerification: undefined
        };
      })
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Admin Dalali list failed", error);
    return NextResponse.json({ error: "The Agent list is unavailable." }, { status: 503 });
  }
}
