import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Lightweight uptime probe. It checks that the process can reach PostgreSQL and
 * reports which optional integrations are configured, without ever exposing a
 * secret. A 200 means "the app can serve traffic"; 503 means a dependency is
 * down so an uptime monitor can alert.
 */
export async function GET() {
  const startedAt = Date.now();
  let database = "ok";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    database = "unavailable";
    console.error("Health check database probe failed", error instanceof Error ? error.message : "unknown");
  }

  const body = {
    status: database === "ok" ? "ok" : "degraded",
    service: "darroom",
    time: new Date().toISOString(),
    checks: {
      database,
      storage: process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY ? "ok" : "not_configured",
      payments: process.env.SONICPESA_ACCESS_KEY && process.env.SONICPESA_SECRET_KEY ? "ok" : "not_configured",
      email: process.env.RESEND_API_KEY ? "ok" : "not_configured"
    },
    latencyMs: Date.now() - startedAt
  };

  return NextResponse.json(body, {
    status: database === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" }
  });
}
