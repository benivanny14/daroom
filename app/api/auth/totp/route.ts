import { NextRequest, NextResponse } from "next/server";
import {
  assertSameOrigin,
  authErrorResponse,
  clearTwoFactorCookie,
  createSession,
  getTwoFactorPendingUser,
  setSessionCookie
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/http";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { consumeBackupCode, matchBackupCode, verifyTotp } from "@/lib/totp";
import { z } from "zod";

export const dynamic = "force-dynamic";

const codeInput = z.object({ code: z.string().trim().min(6).max(32) });

/** Finishes an admin sign-in by checking the six digit code or a backup code. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    if (!(await enforceRateLimit({
      scope: "totp-verify",
      clientId: clientIp(request.headers),
      limit: 10,
      windowSeconds: 900
    }))) {
      return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
    }

    const pending = await getTwoFactorPendingUser();
    if (!pending || !pending.totpSecret) {
      return NextResponse.json({ error: "Your sign-in attempt expired. Log in again." }, { status: 401 });
    }

    const rawBody = await readJsonBody(request, 1024);
    if (!rawBody.ok) return NextResponse.json({ error: "The code is invalid." }, { status: rawBody.status });
    const parsed = codeInput.safeParse(rawBody.value);
    if (!parsed.success) return NextResponse.json({ error: "Enter the 6 digit code." }, { status: 400 });

    const code = parsed.data.code;
    const trustedDevice = verifyTotp(pending.totpSecret, code);

    if (!trustedDevice) {
      const matched = matchBackupCode(pending.totpBackupCodes, code);
      if (!matched) {
        return NextResponse.json({ error: "That code is not correct." }, { status: 401 });
      }
      await prisma.user.update({
        where: { id: pending.id },
        data: { totpBackupCodes: consumeBackupCode(pending.totpBackupCodes || "[]", matched) }
      });
    }

    const token = await createSession(pending.id, pending.sessionVersion);
    const response = NextResponse.json({
      ok: true,
      user: { id: pending.id, name: pending.name, role: pending.role },
      usedBackupCode: !trustedDevice
    });
    clearTwoFactorCookie(response);
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}
