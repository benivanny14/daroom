import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSecurityHeaders } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const page = await prisma.staticPage.findUnique({
      where: { slug }
    });

    if (!page) {
      return NextResponse.json({ error: "Page not found." }, { status: 404 });
    }

    if (!page.published) {
      return NextResponse.json({ error: "Page is not published." }, { status: 404 });
    }

    const response = NextResponse.json({
      page: {
        slug: page.slug,
        title: page.title,
        content: page.content
      }
    });

    return setSecurityHeaders(response);
  } catch (error) {
    console.error("Page fetch failed", error);
    return NextResponse.json({ error: "Service unavailable right now." }, { status: 500 });
  }
}
