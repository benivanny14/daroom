import { NextRequest, NextResponse } from "next/server";
import { AuthError, assertSameOrigin, requireAdmin } from "@/lib/auth";
import { recordAdminAudit } from "@/lib/audit";
import { readJsonBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** Every banned email and phone number, so a ban can be reviewed. */
export async function GET() {
  try {
    await requireAdmin();
    const entries = await prisma.blacklistEntry.findMany({
      select: {
        id: true,
        normalizedEmail: true,
        normalizedPhone: true,
        reason: true,
        createdAt: true,
        moderator: { select: { name: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    return NextResponse.json({ entries });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Blacklist fetch failed", error);
    return NextResponse.json({ error: "The blacklist is unavailable." }, { status: 503 });
  }
}

/**
 * Lifts a ban. A banned address can never register again while its entry
 * exists, which also locked out people who only needed a fresh start, so the
 * administrator can now remove the entry.
 */
export async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();

    const rawBody = await readJsonBody(request, 1024);
    if (!rawBody.ok) {
      return NextResponse.json({ error: "The data is invalid or too large." }, { status: rawBody.status });
    }
    const body = z.object({ id: z.string().min(1).max(64) }).safeParse(rawBody.value);
    if (!body.success) {
      return NextResponse.json({ error: "Choose the entry to remove." }, { status: 400 });
    }

    const entry = await prisma.blacklistEntry.findUnique({
      where: { id: body.data.id },
      select: { id: true, normalizedEmail: true, normalizedPhone: true }
    });
    if (!entry) {
      return NextResponse.json({ error: "That entry no longer exists." }, { status: 404 });
    }

    await prisma.blacklistEntry.delete({ where: { id: entry.id } });
    await recordAdminAudit({
      actorId: admin.id,
      action: "blacklist.remove",
      targetType: "blacklist",
      targetId: entry.id,
      summary: `Lifted the ban on ${entry.normalizedEmail || entry.normalizedPhone}`
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Blacklist removal failed", error);
    return NextResponse.json({ error: "The ban could not be lifted." }, { status: 503 });
  }
}
