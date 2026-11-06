import { z } from "zod";
import { PHOTO_MAX_BYTES } from "./image-compress";

/** Identity documents may be photographed at full phone resolution. */
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

/**
 * Listing photos are compressed in the browser to 300 KB before upload. The
 * server accepts a little more than that target so an encoder that lands a few
 * kilobytes over is not rejected, but a full-size 6 MB photo never gets stored.
 */
export const MAX_PHOTO_BYTES = PHOTO_MAX_BYTES;
/** The size shown to agents: the hard ceiling the server enforces. */
export const PHOTO_LIMIT_KB = Math.round(MAX_PHOTO_BYTES / 1024);

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp"
];

const FILE_UPLOAD_SCHEMA = z.object({
  type: z.enum(["image/jpeg", "image/jpg", "image/png", "image/webp"]),
  size: z.number().int().positive().max(MAX_FILE_SIZE, "Photo must not exceed 15MB"),
  name: z.string().max(255)
});

export class FileUploadError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
  }
}

export type FileUploadLike = {
  type: string;
  size: number;
  name: string;
};

export function validateFileUpload(file: FileUploadLike): { valid: boolean; error?: string } {
  const validation = FILE_UPLOAD_SCHEMA.safeParse({
    type: file.type,
    size: file.size,
    name: file.name
  });

  if (!validation.success) {
    const errors = validation.error.issues.map(e => e.message).join(", ");
    return { valid: false, error: errors };
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { valid: false, error: "Invalid photo type. Use JPEG, PNG, or WebP." };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: "Photo must not exceed 15MB." };
  }

  // Check file extension matches MIME type
  const extension = file.name.split(".").pop()?.toLowerCase();
  const expectedExtensions: Record<string, string[]> = {
    "image/jpeg": ["jpg", "jpeg"],
    "image/jpg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"]
  };

  const allowedExtensions = expectedExtensions[file.type];
  if (extension && !allowedExtensions.includes(extension)) {
    return { valid: false, error: "The file extension does not match the photo type." };
  }

  return { valid: true };
}

/**
 * Listing-photo policy: the same image types as `validateFileUpload`, plus the
 * 350 KB ceiling the browser compressor targets. Kept separate from identity
 * documents, which are allowed to be full-resolution.
 */
export function validateListingPhoto(file: FileUploadLike): { valid: boolean; error?: string } {
  const base = validateFileUpload(file);
  if (!base.valid) return base;
  if (file.size > MAX_PHOTO_BYTES) {
    return {
      valid: false,
      error: `Photos must be ${PHOTO_LIMIT_KB} KB or smaller. Choose a smaller photo or try again.`
    };
  }
  return { valid: true };
}

export function sanitizeFileName(fileName: string): string {
  // Remove path traversal attempts
  const sanitized = fileName.replace(/[^\w\s.-]/gi, "");
  // Remove potentially dangerous sequences
  const safe = sanitized.replace(/\.\./g, "").replace(/\/+/g, "");
  return safe;
}

export function generateStorageKey(userId: string, listingId: string, originalName: string): string {
  const timestamp = Date.now();
  const sanitizedName = sanitizeFileName(originalName);
  const extension = sanitizedName.split(".").pop();
  const baseName = sanitizedName.replace(`.${extension}`, "");
  return `listings/${userId}/${listingId}/${timestamp}-${baseName}.${extension}`;
}

/**
 * Identity documents are stored in the private bucket under
 * `verification/<userId>/`, never in the publicly readable `listings/` prefix.
 */
export function generateVerificationKey(userId: string, originalName: string): string {
  const timestamp = Date.now();
  const sanitizedName = sanitizeFileName(originalName) || "document.jpg";
  const dot = sanitizedName.lastIndexOf(".");
  const extension = dot > 0 ? sanitizedName.slice(dot + 1).toLowerCase() : "jpg";
  const baseName = dot > 0 ? sanitizedName.slice(0, dot) : sanitizedName;
  return `verification/${userId}/${timestamp}-${baseName || "document"}.${extension}`;
}

export function validateImageDimensions(
  width: number,
  height: number
): { valid: boolean; error?: string } {
  const MIN_DIMENSION = 100;
  const MAX_DIMENSION = 4096;
  const MAX_ASPECT_RATIO = 10; // Max 10:1 aspect ratio

  if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
    return { valid: false, error: "Photo must be at least 100x100 pixels." };
  }

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    return { valid: false, error: "Photo must not exceed 4096x4096 pixels." };
  }

  const aspectRatio = Math.max(width, height) / Math.min(width, height);
  if (aspectRatio > MAX_ASPECT_RATIO) {
    return { valid: false, error: "Photo aspect ratio is too wide." };
  }

  return { valid: true };
}
