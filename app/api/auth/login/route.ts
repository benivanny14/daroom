import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, authErrorResponse, createSession, setSessionCookie, setTwoFactorCookie } from "@/lib/auth";
import { readJsonBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const credentials = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128)
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    if (!(await enforceRateLimit({
      scope: "login",
      clientId: clientIp(request.headers),
      limit: 10,
      windowSeconds: 900
    }))) {
      return NextResponse.json({ error: "You've tried too many times. Try again in 15 minutes." }, { status: 429 });
    }

    const rawBody = await readJsonBody(request);
    if (!rawBody.ok) return NextResponse.json({ error: "Invalid request or data too large." }, { status: rawBody.status });
    const body = credentials.safeParse(rawBody.value);
    if (!body.success) return NextResponse.json({ error: "Incorrect email or password." }, { status: 400 });
    if (!(await enforceRateLimit({
      scope: "login-identifier",
      clientId: body.data.email.toLowerCase(),
      limit: 30,
      windowSeconds: 3600
    }))) {
      return NextResponse.json({ error: "You've tried to log in too many times with this email. Try again later." }, { status: 429 });
    }

    const user = await prisma.user.findUnique({ where: { email: body.data.email.toLowerCase() } });
    if (!user || !user.isActive || !(await bcrypt.compare(body.data.password, user.passwordHash))) {
      return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
    }
    if (!user.isEmailVerified) {
      return NextResponse.json({ error: "Verify your email before logging in." }, { status: 403 });
    }

    // Administrators who switched on a second factor stop here and finish at
    // /api/auth/totp; the pending cookie is not a session.
    if (user.role === "ADMIN" && user.totpEnabled && user.totpSecret) {
      const pendingResponse = NextResponse.json({ ok: true, requiresTwoFactor: true });
      await setTwoFactorCookie(pendingResponse, user.id);
      return pendingResponse;
    }

    const token = await createSession(user.id, user.sessionVersion);
    const response = NextResponse.json({ ok: true, user: { id: user.id, name: user.name, role: user.role } });
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}
