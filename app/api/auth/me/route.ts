import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, authErrorResponse, getSessionUser, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/http";
import { normalizeTanzaniaPhone } from "@/lib/phone";
import { hasListingWriteAccess } from "@/lib/subscriptions";
import { z } from "zod";

export const dynamic = "force-dynamic";

const profileUpdate = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().min(9).max(24)
});

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ user: null });

    const subscription = await prisma.subscription.findFirst({
      where: { userId: user.id },
      orderBy: { endsAt: "desc" }
    });
    return NextResponse.json({
      user,
      subscription: subscription
        ? { endsAt: subscription.endsAt, active: hasListingWriteAccess(subscription) }
        : null
    });
  } catch (error) {
    console.error("Failed to load account session", error);
    return NextResponse.json({ error: "Account is unavailable right now." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const sessionUser = await requireUser();
    const rawBody = await readJsonBody(request, 2 * 1024);
    if (!rawBody.ok) {
      return NextResponse.json({ error: "Invalid request or data too large." }, { status: rawBody.status });
    }
    const body = profileUpdate.safeParse(rawBody.value);
    if (!body.success) {
      return NextResponse.json({ error: "Name must be at least 2 characters and the phone number must be valid." }, { status: 400 });
    }

    const phone = normalizeTanzaniaPhone(body.data.phone);
    if (!phone) {
      return NextResponse.json({ error: "Enter a valid Tanzanian phone number." }, { status: 400 });
    }

    const duplicate = await prisma.user.findFirst({
      where: { phone, id: { not: sessionUser.id } },
      select: { id: true }
    });
    if (duplicate) {
      return NextResponse.json({ error: "This phone number is used by another account." }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: sessionUser.id },
      data: {
        name: body.data.name,
        phone
      },
      select: { id: true, name: true, email: true, phone: true, role: true }
    });

    return NextResponse.json({ ok: true, user: updated });
  } catch (error) {
    return authErrorResponse(error);
  }
}
