import { describe, expect, it } from "vitest";
import {
  hasListingWriteAccess,
  isDay27ReminderDue,
  nextSubscriptionEnd,
  SUBSCRIPTION_DAYS
} from "./subscriptions";

const day = 24 * 60 * 60 * 1000;

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

  it("adds a renewal to the remaining time instead of shortening it", () => {
    const now = new Date("2026-01-01T00:00:00Z");

    expect(nextSubscriptionEnd(null, now).getTime()).toBe(now.getTime() + SUBSCRIPTION_DAYS * day);

    const activeEnd = new Date(now.getTime() + 10 * day);
    expect(nextSubscriptionEnd(activeEnd, now).getTime()).toBe(activeEnd.getTime() + SUBSCRIPTION_DAYS * day);

    const expiredEnd = new Date(now.getTime() - 5 * day);
    expect(nextSubscriptionEnd(expiredEnd, now).getTime()).toBe(now.getTime() + SUBSCRIPTION_DAYS * day);
  });
});
