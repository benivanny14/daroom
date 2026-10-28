import { NextRequest, NextResponse } from "next/server";
import { localStorageEnabled, MAX_MEDIA_BYTES, verifyLocalUpload, writeLocalObject } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function matchesImageSignature(contentType: string, bytes: Uint8Array): boolean {
  if (contentType === "image/jpeg" || contentType === "image/jpg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (contentType === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}

export async function PUT(request: NextRequest) {
  if (!localStorageEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const verified = verifyLocalUpload(new URL(request.url).searchParams);
  if (!verified) {
    return NextResponse.json({ error: "The upload link is invalid or has expired." }, { status: 403 });
  }

  const contentType = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (contentType !== verified.contentType) {
    return NextResponse.json({ error: "File type does not match the request." }, { status: 400 });
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_MEDIA_BYTES) {
    return NextResponse.json({ error: "Image must not exceed 15 MB." }, { status: 400 });
  }
  if (!matchesImageSignature(contentType, bytes)) {
    return NextResponse.json({ error: "File is not a valid image." }, { status: 400 });
  }

  await writeLocalObject(verified.key, bytes);
  return new NextResponse(null, { status: 200 });
}
