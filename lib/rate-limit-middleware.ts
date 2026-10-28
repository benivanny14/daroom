import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000; // 1 minute default
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;

export async function rateLimit(identifier: string): Promise<{ success: boolean; remaining: number; resetAt: Date }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_MS);

  try {
    const bucket = await prisma.rateLimitBucket.findUnique({
      where: { key: identifier }
    });

    if (!bucket || bucket.windowStartedAt < windowStart) {
      await prisma.rateLimitBucket.upsert({
        where: { key: identifier },
        update: {
          attempts: 1,
          windowStartedAt: now
        },
        create: {
          key: identifier,
          attempts: 1,
          windowStartedAt: now
        }
      });

      return {
        success: true,
        remaining: MAX_REQUESTS - 1,
        resetAt: new Date(now.getTime() + WINDOW_MS)
      };
    }

    if (bucket.attempts >= MAX_REQUESTS) {
      return {
        success: false,
        remaining: 0,
        resetAt: new Date(bucket.windowStartedAt.getTime() + WINDOW_MS)
      };
    }

    await prisma.rateLimitBucket.update({
      where: { key: identifier },
      data: {
        attempts: bucket.attempts + 1
      }
    });

    return {
      success: true,
      remaining: MAX_REQUESTS - bucket.attempts - 1,
      resetAt: new Date(bucket.windowStartedAt.getTime() + WINDOW_MS)
    };
  } catch (error) {
    console.error("Rate limit check failed", error);
    return { success: true, remaining: MAX_REQUESTS, resetAt: new Date(now.getTime() + WINDOW_MS) };
  }
}

export function getRateLimitIdentifier(request: NextRequest): string {
  const ip = request.headers.get("x-forwarded-for") ||
             request.headers.get("x-real-ip") ||
             "unknown";
  const path = request.nextUrl.pathname;
  return `${ip}:${path}`;
}

export async function withRateLimit(
  request: NextRequest,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const identifier = getRateLimitIdentifier(request);
  const result = await rateLimit(identifier);

  if (!result.success) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(MAX_REQUESTS),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": result.resetAt.toISOString(),
          "Retry-After": String(Math.ceil((result.resetAt.getTime() - Date.now()) / 1000))
        }
      }
    );
  }

  const response = await handler();
  response.headers.set("X-RateLimit-Limit", String(MAX_REQUESTS));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  response.headers.set("X-RateLimit-Reset", result.resetAt.toISOString());

  return response;
}
