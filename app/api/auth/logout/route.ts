import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, authErrorResponse, clearSessionCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}
