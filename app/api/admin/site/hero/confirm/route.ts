import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, authErrorResponse, requireAdmin } from "@/lib/auth";
import { readJsonBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/rate-limit-middleware";
import { setSecurityHeaders } from "@/lib/security";
import { deleteMediaObject, getMediaUrl, objectInfo } from "@/lib/storage";
import { z } from "zod";

export const dynamic = "force-dynamic";

const HERO_KEY = "heroImage";
const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Stores the uploaded hero image as the one shown on the home page. */
export async function POST(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      assertSameOrigin(request);
      await requireAdmin();

      const rawBody = await readJsonBody(request, 2 * 1024);
      if (!rawBody.ok) return NextResponse.json({ error: "The data is invalid or too large." }, { status: rawBody.status });
      const body = z.object({ storageKey: z.string().min(10).max(300) }).safeParse(rawBody.value);
      if (!body.success || !body.data.storageKey.startsWith("site/hero-")) {
        return NextResponse.json({ error: "Image details are invalid." }, { status: 400 });
      }
      const { storageKey } = body.data;

      const object = await objectInfo(storageKey);
      const extension = storageKey.split(".").pop()?.toLowerCase();
      const contentTypeAllowed = !object?.contentType || ALLOWED_CONTENT_TYPES.includes(object.contentType);
      if (
        !object ||
        object.size <= 0 ||
        object.size > 15 * 1024 * 1024 ||
        !extension ||
        !ALLOWED_EXTENSIONS.includes(extension) ||
        !contentTypeAllowed
      ) {
        return NextResponse.json({ error: "The image failed the type or size check." }, { status: 400 });
      }

      const previous = await prisma.siteSetting.findUnique({ where: { key: HERO_KEY } });
      await prisma.siteSetting.upsert({
        where: { key: HERO_KEY },
        create: { key: HERO_KEY, value: storageKey },
        update: { value: storageKey }
      });
      if (previous && previous.value !== storageKey) {
        await deleteMediaObject(previous.value).catch(() => undefined);
      }

      const response = NextResponse.json({ heroImage: getMediaUrl(storageKey), storageKey });
      return setSecurityHeaders(response);
    } catch (error) {
      return authErrorResponse(error);
    }
  });
}

/** Removes the hero image so the illustration shows again. */
export async function DELETE(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      assertSameOrigin(request);
      await requireAdmin();

      const setting = await prisma.siteSetting.findUnique({ where: { key: HERO_KEY } });
      if (setting) {
        await prisma.siteSetting.delete({ where: { key: HERO_KEY } });
        await deleteMediaObject(setting.value).catch(() => undefined);
      }
      const response = NextResponse.json({ ok: true, removed: Boolean(setting) });
      return setSecurityHeaders(response);
    } catch (error) {
      return authErrorResponse(error);
    }
  });
}
