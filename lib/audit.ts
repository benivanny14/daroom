import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export function hashIp(ip: string): string {
  return createHash("sha256")
    .update(`${ip}:${process.env.AUTH_SECRET || "darroom"}`)
    .digest("hex")
    .slice(0, 32);
}

export type AdminAuditInput = {
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
};

/**
 * Audit writes must never block the moderation action they describe. Failures
 * are logged and swallowed so an admin action still succeeds if the audit
 * table is temporarily unavailable.
 */
export async function recordAdminAudit(input: AdminAuditInput): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId || null,
        summary: input.summary,
        metadata: input.metadata ? (input.metadata as object) : undefined,
        ipHash: input.ip ? hashIp(input.ip) : null
      }
    });
  } catch (error) {
    console.error("Admin audit log write failed", error);
  }
}
