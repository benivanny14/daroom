import { createHmac, timingSafeEqual } from "node:crypto";

export const SUBSCRIPTION_PRICE_TZS = 5_000;
export const SUBSCRIPTION_DAYS = 30;
export const REMINDER_DAY = 27;
const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionPeriod = {
  startsAt: Date;
  endsAt: Date;
  status?: "ACTIVE" | "EXPIRED";
  reminderSentAt?: Date | null;
};

export type VerifiedPaymentEvent = {
  eventId: string;
  reference: string;
  status: "paid" | "failed";
  amountTzs: number;
  phone: string;
};

export function hasListingWriteAccess(
  subscription: SubscriptionPeriod | null,
  now: Date = new Date()
): boolean {
  return Boolean(
    subscription &&
      subscription.status !== "EXPIRED" &&
      subscription.startsAt.getTime() <= now.getTime() &&
      now.getTime() < subscription.endsAt.getTime()
  );
}

export function isDay27ReminderDue(
  subscription: SubscriptionPeriod,
  now: Date = new Date()
): boolean {
  const reminderAt = subscription.startsAt.getTime() + REMINDER_DAY * DAY_MS;
  return (
    !subscription.reminderSentAt &&
    now.getTime() >= reminderAt &&
    now.getTime() < subscription.endsAt.getTime()
  );
}

export function verifyPaymentCallback(
  rawBody: string,
  signatureHex: string | null,
  secret: string | undefined
): boolean {
  if (!secret || !signatureHex || !/^[a-f\d]{64}$/i.test(signatureHex)) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(signatureHex, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function parseVerifiedPayment(
  rawBody: string,
  signatureHex: string | null,
  secret: string | undefined
): VerifiedPaymentEvent | null {
  if (!verifyPaymentCallback(rawBody, signatureHex, secret)) return null;

  try {
    const event = JSON.parse(rawBody) as Partial<VerifiedPaymentEvent>;
    if (
      typeof event.eventId !== "string" ||
      typeof event.reference !== "string" ||
      (event.status !== "paid" && event.status !== "failed") ||
      typeof event.amountTzs !== "number" ||
      typeof event.phone !== "string"
    ) {
      return null;
    }
    return event as VerifiedPaymentEvent;
  } catch {
    return null;
  }
}

function periodFromVerifiedPayment(
  verifiedEvent: VerifiedPaymentEvent,
  startsAt: Date
): SubscriptionPeriod | null {
  if (
    verifiedEvent.status !== "paid" ||
    verifiedEvent.amountTzs !== SUBSCRIPTION_PRICE_TZS
  ) {
    return null;
  }
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + SUBSCRIPTION_DAYS * DAY_MS)
  };
}

export function createPaidPeriodFromCallback(
  rawBody: string,
  signatureHex: string | null,
  secret: string | undefined,
  startsAt: Date
): SubscriptionPeriod | null {
  const event = parseVerifiedPayment(rawBody, signatureHex, secret);
  return event ? periodFromVerifiedPayment(event, startsAt) : null;
}
