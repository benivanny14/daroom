import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, authErrorResponse, requireAdmin } from "@/lib/auth";
import { sanitizeFileName, validateFileUpload } from "@/lib/file-upload";
import { readJsonBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/rate-limit-middleware";
import { setSecurityHeaders } from "@/lib/security";
import { generateUploadUrl, getMediaUrl } from "@/lib/storage";
import { z } from "zod";

export const dynamic = "force-dynamic";

const HERO_KEY = "heroImage";

/** Returns the hero image currently shown behind the home page headline. */
export async function GET() {
  try {
    await requireAdmin();
    const setting = await prisma.siteSetting.findUnique({ where: { key: HERO_KEY } });
    const url = setting ? getMediaUrl(setting.value) : null;
    return NextResponse.json({ heroImage: url, storageKey: setting?.value ?? null });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Hands out a signed upload URL for a new hero image. */
export async function POST(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      assertSameOrigin(request);
      await requireAdmin();

      const rawBody = await readJsonBody(request, 2 * 1024);
      if (!rawBody.ok) return NextResponse.json({ error: "The data is invalid or too large." }, { status: rawBody.status });
      const parsed = z.object({
        contentType: z.enum(["image/jpeg", "image/jpg", "image/png", "image/webp"]),
        size: z.number().int().positive(),
        fileName: z.string().trim().max(255).optional()
      }).safeParse(rawBody.value);
      if (!parsed.success) return NextResponse.json({ error: "Image details are invalid." }, { status: 400 });

      const file = {
        type: parsed.data.contentType,
        size: parsed.data.size,
        name: parsed.data.fileName || "hero.jpg"
      };
      const validation = validateFileUpload(file);
      if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });

      const safeName = sanitizeFileName(file.name);
      const extension = safeName.split(".").pop()?.toLowerCase() || "jpg";
      const storageKey = `site/hero-${Date.now()}.${extension}`;
      const { uploadUrl } = await generateUploadUrl(storageKey, file.type, 300, file.size);

      const response = NextResponse.json({ uploadUrl, storageKey, expiresInSeconds: 300 });
      return setSecurityHeaders(response);
    } catch (error) {
      return authErrorResponse(error);
    }
  });
}
