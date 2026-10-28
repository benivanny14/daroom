import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSecurityHeaders } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const methods = await prisma.paymentMethod.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" }
    });

    const response = NextResponse.json({
      methods: methods.map(method => ({
        id: method.id,
        provider: method.provider,
        methodName: method.methodName
      }))
    });

    return setSecurityHeaders(response);
  } catch (error) {
    console.error("Payment methods fetch failed", error);
    return NextResponse.json({ error: "Service unavailable right now." }, { status: 500 });
  }
}
