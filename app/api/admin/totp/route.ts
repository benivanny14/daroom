import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, authErrorResponse, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/http";
import { setSecurityHeaders } from "@/lib/security";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import {
  consumeBackupCode,
  generateBackupCodes,
  generateTotpSecret,
  matchBackupCode,
  otpauthUrl,
  verifyTotp
} from "@/lib/totp";
import { z } from "zod";

export const dynamic = "force-dynamic";

const codeInput = z.object({ code: z.string().trim().min(6).max(32) });

async function limitSetupAttempts(request: NextRequest, adminId: string): Promise<boolean> {
  return enforceRateLimit({
    scope: "admin-totp",
    clientId: `${adminId}:${clientIp(request.headers)}`,
    limit: 10,
    windowSeconds: 900
  });
}

/** Current state of the second factor for the signed-in admin. */
export async function GET() {
  try {
    const admin = await requireAdmin();
    const user = await prisma.user.findUnique({
      where: { id: admin.id },
      select: { totpEnabled: true, totpSecret: true }
    });
    const response = NextResponse.json({
      enabled: Boolean(user?.totpEnabled),
      configured: Boolean(user?.totpSecret)
    });
    return setSecurityHeaders(response);
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Step 1: create (or replace) the shared secret. It stays off until confirmed. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    if (!(await limitSetupAttempts(request, admin.id))) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const secret = generateTotpSecret();
    await prisma.user.update({
      where: { id: admin.id },
      data: { totpSecret: secret, totpEnabled: false, totpBackupCodes: null }
    });

    const response = NextResponse.json({
      secret,
      otpauthUrl: otpauthUrl(admin.email, secret)
    });
    return setSecurityHeaders(response);
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Step 2: prove the authenticator app is working, then switch it on. */
export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    if (!(await limitSetupAttempts(request, admin.id))) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const rawBody = await readJsonBody(request, 1024);
    if (!rawBody.ok) return NextResponse.json({ error: "The code is invalid." }, { status: rawBody.status });
    const parsed = codeInput.safeParse(rawBody.value);
    if (!parsed.success) return NextResponse.json({ error: "Enter the 6 digit code." }, { status: 400 });

    const user = await prisma.user.findUnique({
      where: { id: admin.id },
      select: { totpSecret: true, totpEnabled: true }
    });
    if (!user?.totpSecret) {
      return NextResponse.json({ error: "Start the setup first." }, { status: 400 });
    }
    if (user.totpEnabled) {
      return NextResponse.json({ error: "Two-factor is already switched on." }, { status: 400 });
    }
    if (!verifyTotp(user.totpSecret, parsed.data.code)) {
      return NextResponse.json({ error: "That code is not correct. Check the time on your phone." }, { status: 401 });
    }

    const backup = generateBackupCodes();
    await prisma.user.update({
      where: { id: admin.id },
      data: { totpEnabled: true, totpBackupCodes: backup.stored }
    });

    const response = NextResponse.json({ enabled: true, backupCodes: backup.codes });
    return setSecurityHeaders(response);
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Turn two-factor off; requires a current code or an unused backup code. */
export async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    if (!(await limitSetupAttempts(request, admin.id))) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const rawBody = await readJsonBody(request, 1024);
    if (!rawBody.ok) return NextResponse.json({ error: "The code is invalid." }, { status: rawBody.status });
    const parsed = codeInput.safeParse(rawBody.value);
    if (!parsed.success) return NextResponse.json({ error: "Enter the 6 digit code." }, { status: 400 });

    const user = await prisma.user.findUnique({
      where: { id: admin.id },
      select: { totpSecret: true, totpEnabled: true, totpBackupCodes: true }
    });
    if (!user?.totpEnabled || !user.totpSecret) {
      return NextResponse.json({ error: "Two-factor is not switched on." }, { status: 400 });
    }

    const validCode = verifyTotp(user.totpSecret, parsed.data.code);
    const matchedBackup = validCode ? null : matchBackupCode(user.totpBackupCodes, parsed.data.code);
    if (!validCode && !matchedBackup) {
      return NextResponse.json({ error: "That code is not correct." }, { status: 401 });
    }

    await prisma.user.update({
      where: { id: admin.id },
      data: {
        totpSecret: null,
        totpEnabled: false,
        totpBackupCodes: matchedBackup
          ? consumeBackupCode(user.totpBackupCodes || "[]", matchedBackup)
          : null
      }
    });

    const response = NextResponse.json({ enabled: false });
    return setSecurityHeaders(response);
  } catch (error) {
    return authErrorResponse(error);
  }
}
