import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, authErrorResponse, createSession, requireUser, setSessionCookie } from "@/lib/auth";
import { readJsonBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const passwordChange = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128)
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    if (!(await enforceRateLimit({
      scope: "change-password",
      clientId: clientIp(request.headers),
      limit: 10,
      windowSeconds: 900
    }))) {
      return NextResponse.json({ error: "You've tried too many times. Try again later." }, { status: 429 });
    }
    const sessionUser = await requireUser();
    const rawBody = await readJsonBody(request, 2 * 1024);
    if (!rawBody.ok) {
      return NextResponse.json({ error: "Invalid request or data too large." }, { status: rawBody.status });
    }
    const body = passwordChange.safeParse(rawBody.value);
    if (!body.success) {
      return NextResponse.json({ error: "The new password must be at least 12 characters." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { id: true, passwordHash: true, sessionVersion: true }
    });
    if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });

    const valid = await bcrypt.compare(body.data.currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }
    if (body.data.currentPassword === body.data.newPassword) {
      return NextResponse.json({ error: "The new password must be different from the current one." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(body.data.newPassword, 12);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, sessionVersion: { increment: 1 } },
      select: { sessionVersion: true }
    });

    const token = await createSession(user.id, updated.sessionVersion);
    const response = NextResponse.json({ ok: true, message: "Password changed. Other devices have been signed out." });
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}
