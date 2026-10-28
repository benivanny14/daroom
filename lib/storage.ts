import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const LOCAL_MEDIA_URL_PREFIX = "/uploads";
export const MAX_MEDIA_BYTES = 15 * 1024 * 1024;

let client: S3Client | undefined;

function s3Configured(): boolean {
  return Boolean(
    process.env.S3_ENDPOINT &&
    process.env.S3_REGION &&
    process.env.S3_BUCKET &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY
  );
}

const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "darroom";

function supabaseStorageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

function supabaseBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
}

function supabaseHeaders(): Record<string, string> {
  const key = process.env.SUPABASE_SECRET_KEY || "";
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function encodeStorageKey(key: string): string {
  return key.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function supabaseObjectUrl(key: string, publicUrl = false): string {
  const visibility = publicUrl ? "public/" : "";
  return `${supabaseBaseUrl()}/storage/v1/object/${visibility}${SUPABASE_STORAGE_BUCKET}/${encodeStorageKey(key)}`;
}

async function generateSupabaseUploadUrl(
  key: string,
  expiresIn: number
): Promise<{ uploadUrl: string; storageKey: string }> {
  if (!isSafeStorageKey(key)) throw new Error("Invalid storage key.");
  const response = await fetch(
    `${supabaseBaseUrl()}/storage/v1/object/upload/sign/${SUPABASE_STORAGE_BUCKET}/${encodeStorageKey(key)}`,
    {
      method: "POST",
      headers: { ...supabaseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn })
    }
  );
  if (!response.ok) throw new Error("Could not create a media upload link.");
  const data = (await response.json()) as { url?: string };
  if (!data.url) throw new Error("Could not create a media upload link.");
  return { uploadUrl: `${supabaseBaseUrl()}/storage/v1${data.url}`, storageKey: key };
}

async function supabaseObjectInfo(key: string): Promise<{ size: number; contentType?: string } | null> {
  const response = await fetch(supabaseObjectUrl(key), { method: "HEAD", headers: supabaseHeaders() });
  if (!response.ok) return null;
  return {
    size: Number(response.headers.get("content-length") || 0),
    contentType: response.headers.get("content-type") || undefined
  };
}

async function deleteSupabaseObject(key: string): Promise<void> {
  const response = await fetch(supabaseObjectUrl(key), { method: "DELETE", headers: supabaseHeaders() });
  // Supabase answers 400 with a "not_found" body when the object is already gone.
  if (!response.ok && response.status !== 400 && response.status !== 404) {
    throw new Error("Could not delete the media object.");
  }
}

/**
 * Development fallback: when neither S3 nor Supabase Storage is configured,
 * media is written to `public/uploads` and served by Next.js. This is disabled
 * in production.
 */
export function localStorageEnabled(): boolean {
  return !s3Configured() && !supabaseStorageConfigured() && process.env.NODE_ENV !== "production";
}

export function objectStorage(): { client: S3Client; bucket: string } {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required.");
  }
  client ??= new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey }
  });
  return { client, bucket };
}

export function isSafeStorageKey(key: string): boolean {
  return (
    (key.startsWith("listings/") || key.startsWith("site/")) &&
    key.length <= 300 &&
    !key.includes("..") &&
    !key.includes("\\") &&
    !key.startsWith("/")
  );
}

function localMediaRoot(): string {
  return path.resolve(process.env.MEDIA_LOCAL_DIR || path.join(process.cwd(), "public", "uploads"));
}

function localTarget(key: string): string {
  const root = localMediaRoot();
  const target = path.resolve(root, key);
  if (!target.startsWith(root + path.sep)) throw new Error("Invalid media path.");
  return target;
}

function localSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must contain at least 32 characters for local media uploads.");
  }
  return secret;
}

function signLocalUpload(key: string, contentType: string, expires: number): string {
  return createHmac("sha256", localSecret())
    .update(`${key}\n${contentType}\n${expires}`)
    .digest("base64url");
}

function localUploadUrl(key: string, contentType: string, expiresIn: number): string {
  const expires = Math.floor(Date.now() / 1000) + expiresIn;
  const params = new URLSearchParams({
    key,
    contentType,
    expires: String(expires),
    signature: signLocalUpload(key, contentType, expires)
  });
  return `/api/uploads/local?${params.toString()}`;
}

export function verifyLocalUpload(params: URLSearchParams): { key: string; contentType: string } | null {
  const key = params.get("key") || "";
  const contentType = params.get("contentType") || "";
  const expires = Number(params.get("expires"));
  const signature = params.get("signature") || "";
  if (!isSafeStorageKey(key) || !contentType || !Number.isFinite(expires)) return null;
  if (expires < Math.floor(Date.now() / 1000)) return null;
  const expected = Buffer.from(signLocalUpload(key, contentType, expires));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  return { key, contentType };
}

export async function writeLocalObject(key: string, data: Uint8Array): Promise<void> {
  const target = localTarget(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
}

export async function localObjectInfo(key: string): Promise<{ size: number; contentType?: string } | null> {
  try {
    const info = await stat(localTarget(key));
    return info.isFile() ? { size: info.size } : null;
  } catch {
    return null;
  }
}

export async function deleteLocalObject(key: string): Promise<void> {
  try {
    await unlink(localTarget(key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function generatePresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 300,
  contentLength?: number
): Promise<{ uploadUrl: string; storageKey: string }> {
  const { client, bucket } = objectStorage();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ...(contentLength !== undefined ? { ContentLength: contentLength } : {})
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn });
  return { uploadUrl, storageKey: key };
}

/** Returns an upload URL for the configured driver (local filesystem in development, S3 otherwise). */
export async function generateUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 300,
  contentLength?: number
): Promise<{ uploadUrl: string; storageKey: string }> {
  if (localStorageEnabled()) {
    if (!isSafeStorageKey(key)) throw new Error("Invalid storage key.");
    return { uploadUrl: localUploadUrl(key, contentType, expiresIn), storageKey: key };
  }
  if (supabaseStorageConfigured()) {
    return generateSupabaseUploadUrl(key, expiresIn);
  }
  return generatePresignedUploadUrl(key, contentType, expiresIn, contentLength);
}

/** Returns metadata for an uploaded object, or null when it does not exist. */
export async function objectInfo(key: string): Promise<{ size: number; contentType?: string } | null> {
  if (localStorageEnabled()) return localObjectInfo(key);
  if (supabaseStorageConfigured()) {
    try {
      return await supabaseObjectInfo(key);
    } catch {
      return null;
    }
  }
  try {
    const { client, bucket } = objectStorage();
    const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { size: object.ContentLength ?? 0, contentType: object.ContentType };
  } catch {
    return null;
  }
}

export async function deleteMediaObject(key: string): Promise<void> {
  if (localStorageEnabled()) return deleteLocalObject(key);
  if (supabaseStorageConfigured()) return deleteSupabaseObject(key);
  const { client, bucket } = objectStorage();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export function getMediaUrl(storageKey: string): string | null {
  const baseUrl = process.env.MEDIA_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (baseUrl) return `${baseUrl}/${storageKey}`;
  if (supabaseStorageConfigured()) return supabaseObjectUrl(storageKey, true);
  if (localStorageEnabled()) return `${LOCAL_MEDIA_URL_PREFIX}/${storageKey}`;
  return null;
}

export async function generatePresignedDownloadUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const { client, bucket } = objectStorage();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key
  });

  return getSignedUrl(client, command, { expiresIn });
}

export async function deleteObject(key: string): Promise<void> {
  const { client, bucket } = objectStorage();
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key
  });

  await client.send(command);
}

export function getPublicUrl(key: string): string {
  const baseUrl = process.env.MEDIA_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("MEDIA_PUBLIC_BASE_URL is not configured.");
  }
  return `${baseUrl}/${key}`;
}

export async function listObjects(prefix: string): Promise<string[]> {
  const { client, bucket } = objectStorage();
  const command = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix
  });

  const response = await client.send(command);
  return response.Contents?.map(obj => obj.Key || "").filter(Boolean) || [];
}
