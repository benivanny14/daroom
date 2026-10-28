import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  consumeBackupCode,
  generateBackupCodes,
  generateTotpSecret,
  matchBackupCode,
  otpauthUrl,
  totpAt,
  verifyTotp
} from "./totp";

// RFC 6238 test seed: ASCII "12345678901234567890"
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("base32", () => {
  it("round trips random bytes", () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
  });

  it("ignores lower case input", () => {
    expect(base32Decode("gezdgnbvgy3tq").toString("utf8")).toBe("12345678");
  });
});

describe("totpAt", () => {
  // RFC 6238 SHA-1 vectors, truncated to the 6 digits this app issues.
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"]
  ])("matches the RFC vector at T=%i", (time, expected) => {
    expect(totpAt(RFC_SECRET, time)).toBe(expected);
  });

  it("changes every 30 seconds", () => {
    const first = totpAt(RFC_SECRET, 1_700_000_000);
    const next = totpAt(RFC_SECRET, 1_700_000_030);
    expect(first).not.toBe(next);
  });
});

describe("verifyTotp", () => {
  it("accepts the current code", () => {
    const secret = generateTotpSecret();
    const now = Math.floor(Date.now() / 1000);
    expect(verifyTotp(secret, totpAt(secret, now))).toBe(true);
  });

  it("accepts one step of clock drift", () => {
    const secret = generateTotpSecret();
    const now = Math.floor(Date.now() / 1000);
    expect(verifyTotp(secret, totpAt(secret, now - 30))).toBe(true);
    expect(verifyTotp(secret, totpAt(secret, now + 30))).toBe(true);
  });

  it("rejects a code two steps away", () => {
    const secret = generateTotpSecret();
    const now = Math.floor(Date.now() / 1000);
    expect(verifyTotp(secret, totpAt(secret, now - 60))).toBe(false);
  });

  it("rejects malformed codes", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, "12345")).toBe(false);
    expect(verifyTotp(secret, "abcdef")).toBe(false);
    expect(verifyTotp("", "123456")).toBe(false);
  });
});

describe("otpauthUrl", () => {
  it("builds a scannable link", () => {
    const secret = generateTotpSecret();
    const url = otpauthUrl("admin@darroom.co.tz", secret);
    expect(url.startsWith("otpauth://totp/DarRoom%3Aadmin%40darroom.co.tz?")).toBe(true);
    expect(url).toContain(`secret=${secret}`);
    expect(url).toContain("issuer=DarRoom");
  });
});

describe("backup codes", () => {
  it("issues unique codes that verify once and can be consumed", () => {
    const { codes, stored } = generateBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);

    const matched = matchBackupCode(stored, codes[0]);
    expect(matched).toBeTruthy();

    const remaining = consumeBackupCode(stored, matched as string);
    expect(matchBackupCode(remaining, codes[0])).toBeNull();
    expect(matchBackupCode(remaining, codes[1])).toBeTruthy();
  });

  it("accepts a code pasted with spaces or lower case", () => {
    const { codes, stored } = generateBackupCodes();
    const messy = codes[0].toLowerCase().replace("-", " ");
    expect(matchBackupCode(stored, messy)).toBeTruthy();
  });

  it("returns null for unknown or invalid storage", () => {
    expect(matchBackupCode(null, "ABCDEF-GHIJKL")).toBeNull();
    expect(matchBackupCode("not json", "ABCDEF-GHIJKL")).toBeNull();
  });
});
