import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * RFC 6238 TOTP (SHA-1, 6 digits, 30 second step) plus one-time backup codes.
 * Implemented directly on node:crypto so no extra dependency is needed.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** The 6 digit code for a given moment in time. */
export function totpAt(secret: string, epochSeconds: number): string {
  const counter = Math.floor(epochSeconds / TOTP_PERIOD_SECONDS);
  const message = Buffer.alloc(8);
  message.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  message.writeUInt32BE(counter >>> 0, 4);

  const digest = createHmac("sha1", base32Decode(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/** Accepts the previous, current or next time step to tolerate clock drift. */
export function verifyTotp(secret: string, code: string, windowSteps = 1): boolean {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized) || !secret) return false;
  const now = Math.floor(Date.now() / 1000);
  for (let drift = -windowSteps; drift <= windowSteps; drift += 1) {
    if (constantTimeEquals(totpAt(secret, now + drift * TOTP_PERIOD_SECONDS), normalized)) {
      return true;
    }
  }
  return false;
}

export function otpauthUrl(email: string, secret: string): string {
  const label = encodeURIComponent(`DarRoom:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer: "DarRoom",
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS)
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function hashBackupCode(code: string): string {
  return createHash("sha256").update(normalizeBackupCode(code)).digest("hex");
}

function normalizeBackupCode(code: string): string {
  return code.replace(/[^0-9a-z]/gi, "").toUpperCase();
}

/** Generates one-time codes. Only their SHA-256 hashes are stored. */
export function generateBackupCodes(count = 10): { codes: string[]; stored: string } {
  const codes: string[] = [];
  const hashes: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const raw = randomBytes(6).toString("hex").toUpperCase();
    const code = `${raw.slice(0, 6)}-${raw.slice(6)}`;
    codes.push(code);
    hashes.push(hashBackupCode(code));
  }
  return { codes, stored: JSON.stringify(hashes) };
}

/**
 * Returns the stored hash matching the given code so the caller can consume it.
 */
export function matchBackupCode(stored: string | null | undefined, code: string): string | null {
  if (!stored) return null;
  let hashes: unknown;
  try {
    hashes = JSON.parse(stored);
  } catch {
    return null;
  }
  if (!Array.isArray(hashes)) return null;
  const candidate = hashBackupCode(code);
  for (const entry of hashes) {
    if (typeof entry === "string" && constantTimeEquals(entry, candidate)) return entry;
  }
  return null;
}

/** Removes a used backup code from the stored JSON list. */
export function consumeBackupCode(stored: string, usedHash: string): string {
  let hashes: unknown;
  try {
    hashes = JSON.parse(stored);
  } catch {
    return stored;
  }
  if (!Array.isArray(hashes)) return stored;
  return JSON.stringify(hashes.filter((entry) => entry !== usedHash));
}
