import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export async function enforceRateLimit(input: {
  scope: string;
  clientId: string;
  limit: number;
  windowSeconds: number;
}): Promise<boolean> {
  const key = createHash("sha256")
    .update(`${input.scope}:${input.clientId}`)
    .digest("hex");
  const now = new Date();
  const windowStart = new Date(now.getTime() - input.windowSeconds * 1000);
  const rows = await prisma.$queryRaw<Array<{ attempts: number }>>`
    INSERT INTO "RateLimitBucket" ("key", "attempts", "windowStartedAt", "updatedAt")
    VALUES (${key}, 1, ${now}, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE
        WHEN "RateLimitBucket"."windowStartedAt" <= ${windowStart} THEN 1
        ELSE "RateLimitBucket"."attempts" + 1
      END,
      "windowStartedAt" = CASE
        WHEN "RateLimitBucket"."windowStartedAt" <= ${windowStart} THEN ${now}
        ELSE "RateLimitBucket"."windowStartedAt"
      END,
      "updatedAt" = ${now}
    RETURNING "attempts"
  `;
  return rows[0].attempts <= input.limit;
}

export function clientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
