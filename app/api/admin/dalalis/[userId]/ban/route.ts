import { NextRequest, NextResponse } from "next/server";
import { AuthError, assertSameOrigin, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { banDalali } from "@/lib/moderation";
import { recordAdminAudit } from "@/lib/audit";
import { readJsonBody } from "@/lib/http";
import { clientIp } from "@/lib/rate-limit";
import { z } from "zod";

const banInput = z.object({
  reason: z.string().trim().min(3).max(500)
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await context.params;
    assertSameOrigin(request);
    const admin = await requireAdmin();

    const rawBody = await readJsonBody(request, 2 * 1024);
    if (!rawBody.ok) {
      return NextResponse.json({ error: "The data is invalid or too large." }, { status: rawBody.status });
    }
    const parsed = banInput.safeParse(rawBody.value);
    if (!parsed.success) {
      return NextResponse.json({ error: "Enter a reason for banning the account." }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true, email: true, role: true }
    });
    if (!target || target.role !== "DALALI") {
      return NextResponse.json({ error: "Agent account not found." }, { status: 404 });
    }

    await banDalali(prisma, {
      userId: target.id,
      normalizedPhone: target.phone,
      normalizedEmail: target.email.toLowerCase(),
      reason: parsed.data.reason,
      moderatorId: admin.id
    });

    await recordAdminAudit({
      actorId: admin.id,
      action: "dalali.ban",
      targetType: "user",
      targetId: target.id,
      summary: `Banned the Agent account ${target.email}`,
      metadata: { reason: parsed.data.reason },
      ip: clientIp(request.headers)
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Ban dalali failed", error);
    return NextResponse.json({ error: "Could not ban the account." }, { status: 503 });
  }
}
