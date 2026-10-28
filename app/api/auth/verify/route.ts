import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token || token.length > 128) {
    return NextResponse.redirect(new URL("/account?verified=invalid", request.url));
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = new Date();

  const record = await prisma.authToken.findFirst({
    where: { tokenHash, purpose: "VERIFY_EMAIL", usedAt: null, expiresAt: { gt: now } },
    select: { id: true, userId: true }
  });
  if (!record) return NextResponse.redirect(new URL("/account?verified=invalid", request.url));

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const consumed = await tx.authToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now }
    });
    if (consumed.count !== 1) throw new Error("Verification token was already used.");
    await tx.user.update({ where: { id: record.userId }, data: { isEmailVerified: true } });
  });

  return NextResponse.redirect(new URL("/account?verified=success", request.url));
}
