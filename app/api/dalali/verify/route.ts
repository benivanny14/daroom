import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, authErrorResponse, requireAgent } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteMediaObject, deleteVerificationObject, generateVerificationUploadUrl, verificationObjectInfo } from "@/lib/storage";
import { validateFileUpload, generateVerificationKey } from "@/lib/file-upload";
import { withRateLimit } from "@/lib/rate-limit-middleware";
import { setSecurityHeaders } from "@/lib/security";
import { z } from "zod";

export const dynamic = "force-dynamic";

const documentTypes = ["NATIONAL_ID", "PASSPORT", "DRIVING_LICENSE"] as const;

const documentTypeSchema = z.enum(documentTypes);

export async function POST(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      assertSameOrigin(request);
      const user = await requireAgent();
      const body = z.object({
        documentType: documentTypeSchema,
        contentType: z.enum(["image/jpeg", "image/jpg", "image/png", "image/webp"]),
        size: z.number().int().positive(),
        fileName: z.string().trim().max(255).optional()
      }).safeParse(await request.json());

      if (!body.success) {
        return NextResponse.json({ error: "Document details are invalid." }, { status: 400 });
      }

      const file = {
        type: body.data.contentType,
        size: body.data.size,
        name: body.data.fileName || "document.jpg"
      };

      const validation = validateFileUpload(file);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      // Identity documents go to the private bucket, not the public media one.
      const storageKey = generateVerificationKey(user.id, file.name);
      const uploadUrl = await generateVerificationUploadUrl(storageKey, body.data.contentType, 300);

      const response = NextResponse.json({
        uploadUrl,
        storageKey
      });

      return setSecurityHeaders(response);
    } catch (error) {
      return authErrorResponse(error);
    }
  });
}

export async function PUT(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      assertSameOrigin(request);
      const user = await requireAgent();
      const body = z.object({
        documentType: documentTypeSchema,
        storageKey: z.string().min(20).max(300)
      }).safeParse(await request.json());

      if (!body.success) {
        return NextResponse.json({ error: "Document details are invalid." }, { status: 400 });
      }
      if (!body.data.storageKey.startsWith(`verification/${user.id}/`)) {
        return NextResponse.json({ error: "This document is not accepted." }, { status: 400 });
      }
      const object = await verificationObjectInfo(body.data.storageKey);
      if (!object || object.size <= 0 || object.size > 15 * 1024 * 1024) {
        return NextResponse.json({ error: "The document was not uploaded or is too large." }, { status: 400 });
      }

      const existing = await prisma.idVerification.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" }
      });

      if (existing && existing.status === "APPROVED") {
        return NextResponse.json({ error: "Your identity is already verified." }, { status: 400 });
      }

      // The document only becomes "verified" once an administrator has looked
      // at it. Uploading alone proves nothing, so it waits as PENDING.
      const verification = existing
        ? await prisma.idVerification.update({
            where: { id: existing.id },
            data: {
              documentType: body.data.documentType,
              documentUrl: body.data.storageKey,
              status: "PENDING",
              rejectedReason: null,
              verifiedAt: null
            }
          })
        : await prisma.idVerification.create({
            data: {
              userId: user.id,
              documentType: body.data.documentType,
              documentUrl: body.data.storageKey,
              status: "PENDING",
              verifiedAt: null
            }
          });

      // Replacing a document leaves the old one stored forever; remove it so a
      // rejected identity document cannot be fetched later.
      if (existing && existing.documentUrl && existing.documentUrl !== body.data.storageKey) {
        const previous = existing.documentUrl;
        (previous.startsWith("verification/")
          ? deleteVerificationObject(previous)
          : deleteMediaObject(previous)
        ).catch((error) => console.error("Could not delete the previous identity document", error));
      }

      const response = NextResponse.json({
        verification: {
          id: verification.id,
          status: verification.status
        },
        message: "Your document was received. An administrator will review it shortly."
      });

      return setSecurityHeaders(response);
    } catch (error) {
      return authErrorResponse(error);
    }
  });
}
