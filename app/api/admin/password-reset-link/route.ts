import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AuthError, assertSameOrigin, requireAdmin } from "@/lib/auth";
import { recordAdminAudit } from "@/lib/audit";
import { readJsonBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const RESET_MAX_AGE_MINUTES = 60;

const request = z.object({
  email: z.string().trim().email().max(254)
});

function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Hands the administrator a single-use password reset link to pass on by
 * WhatsApp. Email delivery depends on a verified sending domain, and until one
 * is connected a locked-out user had no way back into their account at all.
 */
export async function POST(rawRequest: NextRequest) {
  try {
    assertSameOrigin(rawRequest);
    const admin = await requireAdmin();
    if (!(await enforceRateLimit({
      scope: "admin-reset-link",
      clientId: admin.id,
      limit: 30,
      windowSeconds: 3600
    }))) {
      return NextResponse.json({ error: "You have created many reset links. Try again later." }, { status: 429 });
    }

    const rawBody = await readJsonBody(rawRequest, 1024);
    if (!rawBody.ok) {
      return NextResponse.json({ error: "The data is invalid or too large." }, { status: rawBody.status });
    }
    const body = request.safeParse(rawBody.value);
    if (!body.success) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: body.data.email.toLowerCase() },
      select: { id: true, name: true, email: true, isActive: true }
    });
    if (!user) {
      return NextResponse.json({ error: "No account uses that email address." }, { status: 404 });
    }
    if (!user.isActive) {
      return NextResponse.json({ error: "That account is deactivated." }, { status: 400 });
    }

    const plainToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(plainToken).digest("hex");
    const expiresAt = new Date(Date.now() + RESET_MAX_AGE_MINUTES * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      // Only the newest link may work.
      await tx.authToken.updateMany({
        where: { userId: user.id, purpose: "RESET_PASSWORD", usedAt: null },
        data: { usedAt: new Date() }
      });
      await tx.authToken.create({
        data: { userId: user.id, tokenHash, purpose: "RESET_PASSWORD", expiresAt }
      });
    });

    await recordAdminAudit({
      actorId: admin.id,
      action: "user.reset-link",
      targetType: "user",
      targetId: user.id,
      summary: `Created a password reset link for ${user.email}`,
      ip: null
    });

    return NextResponse.json({
      user: { name: user.name, email: user.email },
      url: `${appUrl()}/account?reset=${encodeURIComponent(plainToken)}`,
      expiresAt,
      note: "Send this link to the account owner yourself. It works once and expires in one hour."
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Admin reset link failed", error);
    return NextResponse.json({ error: "The reset link could not be created." }, { status: 503 });
  }
}
