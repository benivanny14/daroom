import { NextRequest, NextResponse } from "next/server";
import { AuthError, assertSameOrigin, requireAdmin } from "@/lib/auth";
import { recordAdminAudit } from "@/lib/audit";
import { readJsonBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/rate-limit";
import { deleteVerificationObject } from "@/lib/storage";
import { z } from "zod";

export const dynamic = "force-dynamic";

const decision = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(300).optional()
});

/** An administrator accepts or rejects an uploaded identity document. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ verificationId: string }> }
) {
  try {
    const { verificationId } = await context.params;
    assertSameOrigin(request);
    const admin = await requireAdmin();

    const rawBody = await readJsonBody(request, 2 * 1024);
    if (!rawBody.ok) {
      return NextResponse.json({ error: "The data is invalid or too large." }, { status: rawBody.status });
    }
    const body = decision.safeParse(rawBody.value);
    if (!body.success) {
      return NextResponse.json({ error: "Choose whether to approve or reject the document." }, { status: 400 });
    }

    const verification = await prisma.idVerification.findUnique({
      where: { id: verificationId },
      select: {
        id: true,
        userId: true,
        status: true,
        documentUrl: true,
        user: { select: { email: true } }
      }
    });
    if (!verification) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const approved = body.data.action === "approve";
    const updated = await prisma.idVerification.update({
      where: { id: verification.id },
      data: {
        status: approved ? "APPROVED" : "REJECTED",
        verifiedAt: approved ? new Date() : null,
        rejectedReason: approved ? null : body.data.reason || "The document could not be verified."
      },
      select: { id: true, status: true }
    });

    // A rejected document is personal data with no further use, so it is
    // deleted from storage instead of being kept around.
    if (!approved && verification.documentUrl.startsWith("verification/")) {
      deleteVerificationObject(verification.documentUrl).catch((error) =>
        console.error("Could not delete a rejected identity document", error)
      );
    }

    await recordAdminAudit({
      actorId: admin.id,
      action: approved ? "verification.approve" : "verification.reject",
      targetType: "user",
      targetId: verification.userId,
      summary: `${approved ? "Approved" : "Rejected"} the identity document of ${verification.user.email}`,
      metadata: approved ? undefined : { reason: updated.status === "REJECTED" ? body.data.reason : undefined },
      ip: clientIp(request.headers)
    });

    return NextResponse.json({ verification: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Verification decision failed", error);
    return NextResponse.json({ error: "The decision could not be saved." }, { status: 503 });
  }
}
