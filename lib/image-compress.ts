/**
 * Compress a room photo in the browser before it is uploaded.
 *
 * Agents often shoot 4–8 MB phone photos. Re-encoding to a 2000 px JPEG keeps
 * the listing sharp on a phone screen while cutting upload time and Supabase
 * storage. If anything fails (old browser, no canvas, already small) the
 * original file is returned so the upload still works.
 */

const MAX_DIMENSION = 2000;
const COMPRESS_THRESHOLD = 900 * 1024; // 900 KB
const JPEG_QUALITY = 0.82;

export async function compressImage(file: File): Promise<File> {
  if (typeof document === "undefined" || !file.type.startsWith("image/")) return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const largestSide = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, MAX_DIMENSION / largestSide);
    // Small file that is already within the size limit needs no work.
    if (scale === 1 && file.size <= COMPRESS_THRESHOLD) return file;

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;

    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
    });
    if (!blob || blob.size >= file.size) return file;

    const name = `${file.name.replace(/\.[^.]+$/, "") || "room-photo"}.jpg`;
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
