import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createPaidPeriodFromCallback,
  isDay27ReminderDue,
  parseVerifiedPayment,
  hasListingWriteAccess,
  SUBSCRIPTION_DAYS,
  SUBSCRIPTION_PRICE_TZS
} from "./subscriptions";

const day = 24 * 60 * 60 * 1000;
const secret = "demo-test-secret-only";
const event = {
  eventId: "event-01",
  reference: "order-01",
  status: "paid" as const,
  amountTzs: SUBSCRIPTION_PRICE_TZS,
  phone: "255712345678"
};

describe("subscription access rules", () => {
  it("permits listing writes before the exact expiry and denies after", () => {
    const startsAt = new Date("2026-01-01T00:00:00Z");
    const subscription = {
      startsAt,
      endsAt: new Date(startsAt.getTime() + SUBSCRIPTION_DAYS * day)
    };
    expect(hasListingWriteAccess(subscription, startsAt)).toBe(true);
    expect(hasListingWriteAccess(subscription, subscription.endsAt)).toBe(false);
    expect(hasListingWriteAccess(null)).toBe(false);
  });

  it("makes a single day-27 reminder eligible only before expiry", () => {
    const startsAt = new Date("2026-01-01T00:00:00Z");
    const subscription = {
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * day)
    };
    expect(isDay27ReminderDue(subscription, new Date(startsAt.getTime() + 26 * day))).toBe(false);
    expect(isDay27ReminderDue(subscription, new Date(startsAt.getTime() + 27 * day))).toBe(true);
    expect(isDay27ReminderDue({ ...subscription, reminderSentAt: startsAt }, new Date(startsAt.getTime() + 28 * day))).toBe(false);
    expect(isDay27ReminderDue(subscription, subscription.endsAt)).toBe(false);
  });

  it("accepts only correctly signed payment callback payloads", () => {
    const raw = JSON.stringify(event);
    const signature = createHmac("sha256", secret).update(raw).digest("hex");
    expect(parseVerifiedPayment(raw, signature, secret)).toEqual(event);
    expect(parseVerifiedPayment(raw, "0".repeat(64), secret)).toBeNull();
    expect(parseVerifiedPayment(raw, signature, undefined)).toBeNull();
    expect(parseVerifiedPayment(raw, null, secret)).toBeNull();
  });

  it("starts the exact 30-day period only for a verified paid amount", () => {
    const startsAt = new Date("2026-01-01T00:00:00Z");
    const raw = JSON.stringify(event);
    const signature = createHmac("sha256", secret).update(raw).digest("hex");
    expect(createPaidPeriodFromCallback(raw, signature, secret, startsAt)?.endsAt.getTime()).toBe(startsAt.getTime() + 30 * day);
    expect(createPaidPeriodFromCallback(raw, signature, "wrong-secret", startsAt)).toBeNull();

    const wrongAmount = JSON.stringify({ ...event, amountTzs: 1000 });
    const wrongAmountSignature = createHmac("sha256", secret).update(wrongAmount).digest("hex");
    expect(createPaidPeriodFromCallback(wrongAmount, wrongAmountSignature, secret, startsAt)).toBeNull();

    const failed = JSON.stringify({ ...event, status: "failed" });
    const failedSignature = createHmac("sha256", secret).update(failed).digest("hex");
    expect(createPaidPeriodFromCallback(failed, failedSignature, secret, startsAt)).toBeNull();
  });
});
