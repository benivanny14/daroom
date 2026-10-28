import { randomBytes, createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, authErrorResponse } from "@/lib/auth";
import { emailConfigured, sendActionLink } from "@/lib/email";
import { readJsonBody } from "@/lib/http";
import { normalizeTanzaniaPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const registration = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  phone: z.string().min(9).max(24),
  password: z.string().min(12).max(128),
  // Tenants only search, save and book viewings. Agents opt in explicitly.
  role: z.enum(["TENANT", "DALALI"]).default("TENANT")
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    if (!(await enforceRateLimit({
      scope: "register",
      clientId: clientIp(request.headers),
      limit: 5,
      windowSeconds: 900
    }))) {
      return NextResponse.json({ error: "You've tried too many times. Try again in 15 minutes." }, { status: 429 });
    }

    const rawBody = await readJsonBody(request);
    if (!rawBody.ok) return NextResponse.json({ error: "Invalid request or data too large." }, { status: rawBody.status });
    const body = registration.safeParse(rawBody.value);
    if (!body.success) {
      return NextResponse.json({ error: "Enter your name, email, phone number, and a password of at least 12 characters." }, { status: 400 });
    }
    const email = body.data.email.toLowerCase();
    const phone = normalizeTanzaniaPhone(body.data.phone);
    if (!phone) return NextResponse.json({ error: "Enter a valid Tanzanian phone number." }, { status: 400 });

    const blacklisted = await prisma.blacklistEntry.findFirst({
      where: { OR: [{ normalizedPhone: phone }, { normalizedEmail: email }] },
      select: { id: true }
    });
    if (blacklisted) return NextResponse.json({ error: "Registration cannot be completed with these details." }, { status: 400 });

    const passwordHash = await bcrypt.hash(body.data.password, 12);

    // Without an email provider there is no way to verify ownership of the
    // address. Rather than creating an account that can never be used, the
    // address is accepted as-is and the account is usable immediately.
    if (!emailConfigured()) {
      await prisma.user.create({
        data: {
          name: body.data.name,
          email,
          phone,
          passwordHash,
          role: body.data.role,
          isEmailVerified: true
        }
      });
      return NextResponse.json({
        ok: true,
        message: "Account created. You can log in now."
      }, { status: 201 });
    }

    const plainToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(plainToken).digest("hex");
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: body.data.name,
          email,
          phone,
          passwordHash,
          role: body.data.role
        }
      });
      await tx.authToken.create({
        data: {
          userId: created.id,
          tokenHash,
          purpose: "VERIFY_EMAIL",
          expiresAt: new Date(Date.now() + 60 * 60 * 1000)
        }
      });
      return created;
    });

    const baseUrl = process.env.APP_URL || "http://localhost:3000";
    const verifyUrl = `${baseUrl}/api/auth/verify?token=${encodeURIComponent(plainToken)}`;
    try {
      await sendActionLink({
        to: email,
        name: user.name,
        url: verifyUrl,
        purpose: "verify"
      });
    } catch (error) {
      console.error("Account verification email failed", error);
      // Do not leave an unusable account behind: the address must stay free
      // so the person can try again once email delivery works.
      await prisma.user.delete({ where: { id: user.id } }).catch((cleanupError) => {
        console.error("Could not roll back unverified account", cleanupError);
      });
      return NextResponse.json({
        error: "We could not send the verification email. Please try again in a few minutes."
      }, { status: 503 });
    }

    return NextResponse.json({
      ok: true,
      message: "Check your email to verify your account before logging in."
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "This email or phone number is already registered." }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}
