import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AuthError, assertSameOrigin } from "@/lib/auth";
import { sendActionLink, emailConfigured } from "@/lib/email";
import { readJsonBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    if (!(await enforceRateLimit({
      scope: "resend-verification",
      clientId: clientIp(request.headers),
      limit: 4,
      windowSeconds: 3600
    }))) {
      return NextResponse.json({ error: "You've tried too many times. Try again later." }, { status: 429 });
    }
    const rawBody = await readJsonBody(request);
    if (!rawBody.ok) return NextResponse.json({ error: "Invalid request or data too large." }, { status: rawBody.status });
    const body = z.object({ email: z.string().trim().email().max(254) }).safeParse(rawBody.value);
    if (!body.success) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    const user = await prisma.user.findUnique({ where: { email: body.data.email.toLowerCase() } });
    let devVerifyUrl: string | undefined;

    if (user && !user.isEmailVerified && user.isActive) {
      const plainToken = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(plainToken).digest("hex");
      const verifyUrl = `${process.env.APP_URL || "http://localhost:3000"}/api/auth/verify?token=${encodeURIComponent(plainToken)}`;
      await prisma.$transaction(async (tx: import("@prisma/client").Prisma.TransactionClient) => {
        await tx.authToken.updateMany({
          where: { userId: user.id, purpose: "VERIFY_EMAIL", usedAt: null },
          data: { usedAt: new Date() }
        });
        await tx.authToken.create({
          data: {
            userId: user.id,
            tokenHash,
            purpose: "VERIFY_EMAIL",
            expiresAt: new Date(Date.now() + 60 * 60 * 1000)
          }
        });
      });
      try {
        await sendActionLink({
          to: user.email,
          name: user.name,
          url: verifyUrl,
          purpose: "verify"
        });
      } catch (error) {
        console.error("Verification email resend failed", error);
      }
      if (process.env.NODE_ENV !== "production" && !emailConfigured()) devVerifyUrl = verifyUrl;
    }

    return NextResponse.json({
      ok: true,
      message: "If your account needs verification, we've sent a new link to your email.",
      devVerifyUrl
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Email verification resend failed", error);
    return NextResponse.json({ error: "The link could not be sent right now." }, { status: 503 });
  }
}
