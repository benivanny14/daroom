import { NextResponse } from "next/server";
import { createHash, randomBytes, timingSafeEqual } from "crypto";

// Fresh per process so the digest cannot be precomputed.
const compareKey = randomBytes(32);

/**
 * Constant-time string comparison for secrets (cron keys, shared tokens).
 * Both sides are hashed first so unequal lengths cannot short-circuit.
 */
export function timingSafeCompare(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(compareKey).update(provided).digest();
  const b = createHash("sha256").update(compareKey).update(expected).digest();
  return timingSafeEqual(a, b);
}

export function setSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");

  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  return response;
}
