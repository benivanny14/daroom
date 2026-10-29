import { NextRequest, NextResponse } from "next/server";
import {
  assertSameOrigin,
  authErrorResponse,
  clearSessionCookie,
  getSessionUser
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Logs out of every device by bumping the session version.
 *
 * The cookie is cleared even when the session is already invalid or the
 * account is not verified yet: otherwise a stale session can leave someone
 * stuck with a cookie they cannot remove.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await getSessionUser();
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { sessionVersion: { increment: 1 } }
      });
    }
    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}
