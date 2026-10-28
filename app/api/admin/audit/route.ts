import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const requested = Number(searchParams.get("take"));
    const take = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, 200) : 100;

    const logs = await prisma.adminAuditLog.findMany({
      include: { actor: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take
    });
    return NextResponse.json({ logs });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Admin audit log fetch failed", error);
    return NextResponse.json({ error: "The audit log is currently unavailable." }, { status: 503 });
  }
}
