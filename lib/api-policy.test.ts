import { describe, expect, it } from "vitest";
import { generateStorageKey, sanitizeFileName, validateFileUpload } from "./file-upload";
import { readJsonBody } from "./http";
import { formatTanzaniaPhone, maskPhone, normalizeTanzaniaPhone } from "./phone";
import { isSafeStorageKey } from "./storage";
import { LISTING_DURATION_DAYS, listingExpiryFrom, notExpiredFilter } from "./listing-policy";
import { SUBSCRIPTION_PLANS, canUserAddListing, hasFeaturedSlots } from "./subscriptions-plans";

const MB = 1024 * 1024;

describe("photo upload policy", () => {
  it("accepts a photo up to the 5 MB limit", () => {
    expect(validateFileUpload({ type: "image/jpeg", size: 5 * MB, name: "room.jpg" }).valid).toBe(true);
    expect(validateFileUpload({ type: "image/webp", size: 1 * MB, name: "room.webp" }).valid).toBe(true);
  });

  it("rejects a photo one byte over the limit", () => {
    const result = validateFileUpload({ type: "image/jpeg", size: 5 * MB + 1, name: "room.jpg" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("5MB");
  });

  it("rejects types and extensions that are not allowed", () => {
    expect(validateFileUpload({ type: "image/gif", size: 1024, name: "room.gif" }).valid).toBe(false);
    expect(validateFileUpload({ type: "image/png", size: 1024, name: "room.jpg" }).valid).toBe(false);
    expect(validateFileUpload({ type: "image/jpeg", size: 0, name: "room.jpg" }).valid).toBe(false);
  });

  it("sanitises file names used in storage keys", () => {
    expect(sanitizeFileName("../../etc/passwd")).not.toContain("..");
    const key = generateStorageKey("user-1", "listing-1", "my room photo (1).jpg");
    expect(key.startsWith("listings/user-1/listing-1/")).toBe(true);
    expect(key.endsWith(".jpg")).toBe(true);
  });
});

describe("storage key policy", () => {
  it("accepts listing photos and site images", () => {
    expect(isSafeStorageKey("listings/user/listing/1-photo.jpg")).toBe(true);
    expect(isSafeStorageKey("site/hero-1730000000000.jpg")).toBe(true);
  });

  it("blocks traversal, absolute and foreign keys", () => {
    expect(isSafeStorageKey("listings/../../secret.jpg")).toBe(false);
    expect(isSafeStorageKey("/etc/passwd")).toBe(false);
    expect(isSafeStorageKey("site/../listings/a.jpg")).toBe(false);
    expect(isSafeStorageKey("avatars/user.jpg")).toBe(false);
    expect(isSafeStorageKey("listings\\user\\photo.jpg")).toBe(false);
    expect(isSafeStorageKey(`listings/${"a".repeat(400)}.jpg`)).toBe(false);
  });
});

describe("request body policy", () => {
  const jsonRequest = (body: string, headers: Record<string, string> = {}) =>
    new Request("http://localhost/api", { method: "POST", body, headers });

  it("parses a valid JSON body", async () => {
    const result = await readJsonBody(jsonRequest(JSON.stringify({ days: 7 }), { "Content-Type": "application/json" }));
    expect(result).toEqual({ ok: true, value: { days: 7 } });
  });

  it("answers 400 for malformed or missing bodies", async () => {
    expect(await readJsonBody(jsonRequest("{oops"))).toEqual({ ok: false, status: 400 });
    expect(await readJsonBody(new Request("http://localhost/api", { method: "GET" }))).toEqual({ ok: false, status: 400 });
  });

  it("answers 413 when the declared body is too large", async () => {
    const result = await readJsonBody(jsonRequest("{}", { "Content-Length": String(64 * 1024) }), 1024);
    expect(result).toEqual({ ok: false, status: 413 });
  });
});

describe("phone privacy", () => {
  it("masks public numbers and keeps full numbers for the contact route only", () => {
    expect(maskPhone("255712345678")).toBe("2557***678");
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone("")).toBeNull();
  });

  it("normalises Tanzanian numbers and formats them for humans", () => {
    expect(normalizeTanzaniaPhone("0712345678")).toBe("255712345678");
    expect(normalizeTanzaniaPhone("+255 712 345 678")).toBe("255712345678");
    expect(normalizeTanzaniaPhone("12345")).toBeNull();
    expect(formatTanzaniaPhone("255712345678")).toBe("0712 345 678");
  });
});

describe("plan rules", () => {
  it("keeps the published prices and durations stable", () => {
    expect(SUBSCRIPTION_PLANS.BASIC.priceTzs).toBe(5000);
    expect(SUBSCRIPTION_PLANS.PREMIUM.priceTzs).toBe(15000);
    expect(SUBSCRIPTION_PLANS.FEATURED.priceTzs).toBe(30000);
    expect(SUBSCRIPTION_PLANS.BASIC.durationDays).toBe(30);
  });

  it("gives featured slots only to the paid plans", () => {
    expect(hasFeaturedSlots(0, "BASIC")).toBe(false);
    expect(hasFeaturedSlots(0, "PREMIUM")).toBe(true);
    expect(hasFeaturedSlots(2, "PREMIUM")).toBe(false);
    expect(hasFeaturedSlots(5, "FEATURED")).toBe(false);
    expect(hasFeaturedSlots(0, "UNKNOWN")).toBe(false);
  });

  it("enforces the listing limit of each plan", () => {
    expect(canUserAddListing(4, "BASIC")).toBe(true);
    expect(canUserAddListing(5, "BASIC")).toBe(false);
    expect(canUserAddListing(20, "PREMIUM")).toBe(false);
    expect(canUserAddListing(0, "NOT_A_PLAN")).toBe(false);
  });
});

describe("listing expiry", () => {
  it("expires listings after the 60 day window", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(listingExpiryFrom(now).getTime() - now.getTime()).toBe(LISTING_DURATION_DAYS * 24 * 60 * 60 * 1000);
  });

  it("keeps legacy rows without an expiry date", () => {
    expect(notExpiredFilter()).toEqual({ OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }] });
  });
});
