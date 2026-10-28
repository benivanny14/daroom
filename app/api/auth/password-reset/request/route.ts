import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, authErrorResponse } from "@/lib/auth";
import { emailConfigured, sendActionLink } from "@/lib/email";
import { readJsonBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return authErrorResponse(error);
  }
  if (!(await enforceRateLimit({
    scope: "password-reset",
    clientId: clientIp(request.headers),
    limit: 5,
    windowSeconds: 900
  }))) {
    return NextResponse.json({ error: "You've tried too many times. Try again later." }, { status: 429 });
  }
  const rawBody = await readJsonBody(request);
  if (!rawBody.ok) return NextResponse.json({ error: "Invalid request or data too large." }, { status: rawBody.status });
  const body = z.object({ email: z.string().trim().email().max(254) }).safeParse(rawBody.value);
  if (!body.success) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  if (!emailConfigured()) {
    return NextResponse.json({
      error: "Password reset by email is not available right now. Contact support for help."
    }, { status: 503 });
  }

  const user = await prisma.user.findUnique({ where: { email: body.data.email.toLowerCase() } });
  if (user?.isActive) {
    const plainToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(plainToken).digest("hex");
    await prisma.authToken.create({
      data: {
        userId: user.id,
        tokenHash,
        purpose: "RESET_PASSWORD",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000)
      }
    });
    try {
      await sendActionLink({
        to: user.email,
        name: user.name,
        url: `${process.env.APP_URL || "http://localhost:3000"}/account?reset=${encodeURIComponent(plainToken)}`,
        purpose: "reset"
      });
    } catch (error) {
      console.error("Password reset email failed", error);
      return NextResponse.json({
        error: "The reset email could not be sent. Please try again in a few minutes."
      }, { status: 503 });
    }
  }
  return NextResponse.json({ ok: true, message: "If this email is registered, you'll receive a password reset link." });
}
