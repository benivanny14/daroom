/**
 * Compress a room photo in the browser before it is uploaded.
 *
 * Agents shoot 4–8 MB phone photos. Every photo is re-encoded so the stored
 * file stays at or below 300 KB: uploaded bytes, Supabase storage and the
 * bandwidth tenants spend scrolling listings then stay predictable. Photos are
 * encoded as WebP first (smaller at the same visual quality) and fall back to
 * JPEG where the browser cannot encode WebP.
 *
 * The encoder lowers quality first and only then shrinks the image, so a typical
 * 12 MP phone photo lands around 150–250 KB at 1600 px without visible banding.
 * If the browser has no canvas/bitmap support the original file is returned and
 * the server-side size check decides whether it may be stored.
 */

/** Photos are stored at this size or below. */
export const PHOTO_TARGET_BYTES = 300 * 1024;

/**
 * Hard server-side ceiling for a stored listing photo. It sits a little above
 * the browser target so an encoder that lands a few kilobytes over is still
 * accepted, while a full-size camera file never reaches storage.
 */
export const PHOTO_MAX_BYTES = 350 * 1024;

/** Hero images use the same browser pass; the server accepts a little more. */
export const HERO_MAX_BYTES = 500 * 1024;

const MAX_DIMENSION = 1600;
const MIN_DIMENSION = 640;
const QUALITY_STEPS = [0.82, 0.72, 0.62, 0.52, 0.44];
const MAX_ROUNDS = 3;

function toFile(blob: Blob, type: string, originalName: string): File {
  const extension = type === "image/webp" ? "webp" : "jpg";
  const base = (originalName.replace(/\.[^.]+$/, "") || "room-photo").slice(0, 80);
  return new File([blob], `${base}.${extension}`, {
    type,
    lastModified: Date.now()
  });
}

async function encode(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<{ blob: Blob; type: string } | null> {
  for (const type of ["image/webp", "image/jpeg"]) {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, type, quality);
    });
    // Browsers that cannot encode the requested type silently return a PNG or
    // null instead of failing, so the produced type is checked.
    if (blob && blob.type === type) return { blob, type };
  }
  return null;
}

export async function compressImage(file: File): Promise<File> {
  if (typeof document === "undefined" || !file.type.startsWith("image/")) return file;

  let bitmap: ImageBitmap | null = null;
  try {
    // Respect the EXIF orientation of phone photos, otherwise portrait shots
    // are stored sideways once the metadata is stripped by re-encoding.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return file;
    }
  }

  try {
    const largestSide = Math.max(bitmap.width, bitmap.height);
    let scale = Math.min(1, MAX_DIMENSION / largestSide);
    // A small, already-oriented file needs no re-encoding.
    if (scale === 1 && file.size <= PHOTO_TARGET_BYTES) return file;

    let smallest: { blob: Blob; type: string } | null = null;

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return file;

      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, width, height);

      for (const quality of QUALITY_STEPS) {
        const encoded = await encode(canvas, quality);
        if (!encoded) return file;
        if (!smallest || encoded.blob.size < smallest.blob.size) smallest = encoded;
        if (encoded.blob.size <= PHOTO_TARGET_BYTES) {
          return toFile(encoded.blob, encoded.type, file.name);
        }
      }

      // Quality alone was not enough: shrink and try again, but never below a
      // size that would look blurry on a phone screen.
      if (Math.min(width, height) <= MIN_DIMENSION) break;
      scale *= 0.78;
    }

    if (!smallest) return file;
    if (smallest.blob.size >= file.size) return file;
    return toFile(smallest.blob, smallest.type, file.name);
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
