import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, assertSameOrigin, requireAdmin } from "@/lib/auth";
import { recordAdminAudit } from "@/lib/audit";
import { readJsonBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/rate-limit";

const input = z.object({
  freeAccess: z.boolean()
});

/**
 * Lets an admin give one Agent free listing and photo uploads without a paid
 * subscription, or turn that free access off so the Agent must pay TSh 5,000
 * again. The change is audited and takes effect on the Agent's next request.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await context.params;
    assertSameOrigin(request);
    const admin = await requireAdmin();

    const rawBody = await readJsonBody(request, 1024);
    if (!rawBody.ok) {
      return NextResponse.json({ error: "The data is invalid or too large." }, { status: rawBody.status });
    }
    const parsed = input.safeParse(rawBody.value);
    if (!parsed.success) {
      return NextResponse.json({ error: "Choose whether free access is on or off." }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true }
    });
    if (!target || target.role !== "DALALI") {
      return NextResponse.json({ error: "Agent account not found." }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: target.id },
      data: { freeAccess: parsed.data.freeAccess }
    });

    await recordAdminAudit({
      actorId: admin.id,
      action: parsed.data.freeAccess ? "dalali.free_access_on" : "dalali.free_access_off",
      targetType: "user",
      targetId: target.id,
      summary: parsed.data.freeAccess
        ? `Gave free listing access to ${target.email}`
        : `Removed free listing access from ${target.email}`,
      ip: clientIp(request.headers)
    });

    return NextResponse.json({ ok: true, freeAccess: parsed.data.freeAccess });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Free access toggle failed", error);
    return NextResponse.json({ error: "Could not update free access." }, { status: 503 });
  }
}
