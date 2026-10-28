import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, authErrorResponse } from "@/lib/auth";
import { readJsonBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const resetRequest = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(12).max(128)
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return authErrorResponse(error);
  }
  if (!(await enforceRateLimit({
    scope: "password-reset-confirm",
    clientId: clientIp(request.headers),
    limit: 10,
    windowSeconds: 900
  }))) {
    return NextResponse.json({ error: "You've tried too many times. Try again later." }, { status: 429 });
  }
  const rawBody = await readJsonBody(request);
  if (!rawBody.ok) return NextResponse.json({ error: "Invalid request or data too large." }, { status: rawBody.status });
  const body = resetRequest.safeParse(rawBody.value);
  if (!body.success) {
    return NextResponse.json({ error: "Invalid link or the password is shorter than 12 characters." }, { status: 400 });
  }

  const tokenHash = createHash("sha256").update(body.data.token).digest("hex");
  const now = new Date();
  const token = await prisma.authToken.findFirst({
    where: { tokenHash, purpose: "RESET_PASSWORD", usedAt: null, expiresAt: { gt: now } },
    select: { id: true, userId: true }
  });
  if (!token) return NextResponse.json({ error: "This link has expired or has already been used." }, { status: 400 });

  const passwordHash = await bcrypt.hash(body.data.password, 12);
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const consumed = await tx.authToken.updateMany({
      where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now }
    });
    if (consumed.count !== 1) throw new Error("Password reset token was already used.");
    await tx.user.update({
      where: { id: token.userId },
      data: { passwordHash, sessionVersion: { increment: 1 } }
    });
    await tx.authToken.updateMany({
      where: { userId: token.userId, purpose: "RESET_PASSWORD", usedAt: null },
      data: { usedAt: now }
    });
  });
  return NextResponse.json({ ok: true, message: "Password changed. You can now log in." });
}
