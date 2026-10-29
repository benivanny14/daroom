import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[character];
  });
}

/**
 * Step one of email verification. The link in the email only opens this page;
 * the token is spent by the form it renders. Mail clients and link scanners
 * fetch URLs on their own, and a GET that consumed the token meant the real
 * person saw "this link has expired" before they ever clicked it.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token || token.length > 128) {
    return NextResponse.redirect(new URL("/account?verified=invalid", request.url));
  }

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Verify your DarRoom account</title>
  </head>
  <body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px">
    <main style="max-width:420px;width:100%;background:#1e293b;border:1px solid #334155;border-radius:14px;padding:28px">
      <h1 style="font-size:20px;margin:0 0 12px">Verify your email</h1>
      <p style="margin:0 0 20px;line-height:1.5;color:#94a3b8">
        Confirm that this address belongs to you. The link works once and expires one hour after it was sent.
      </p>
      <form method="post" action="/api/auth/verify">
        <input type="hidden" name="token" value="${escapeHtml(token)}" />
        <button type="submit" style="width:100%;padding:12px 16px;border:0;border-radius:10px;background:#22c55e;color:#052e16;font-size:15px;font-weight:600;cursor:pointer">
          Confirm my email
        </button>
      </form>
    </main>
  </body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer"
    }
  });
}

/** Step two: spends the token once the person confirms. */
export async function POST(request: NextRequest) {
  let token: string | null = request.nextUrl.searchParams.get("token");
  if (!token) {
    const form = await request.formData().catch(() => null);
    const value = form?.get("token");
    if (typeof value === "string") token = value;
  }

  if (!token || token.length > 128) {
    return NextResponse.redirect(new URL("/account?verified=invalid", request.url), 303);
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = new Date();
  const record = await prisma.authToken.findFirst({
    where: { tokenHash, purpose: "VERIFY_EMAIL", usedAt: null, expiresAt: { gt: now } },
    select: { id: true, userId: true }
  });
  if (!record) {
    return NextResponse.redirect(new URL("/account?verified=invalid", request.url), 303);
  }

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const consumed = await tx.authToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now }
      });
      if (consumed.count !== 1) throw new Error("Verification token was already used.");
      await tx.user.update({ where: { id: record.userId }, data: { isEmailVerified: true } });
    });
  } catch {
    // A second click loses the race, which is not an error worth a crash page.
    return NextResponse.redirect(new URL("/account?verified=invalid", request.url), 303);
  }

  return NextResponse.redirect(new URL("/account?verified=success", request.url), 303);
}
