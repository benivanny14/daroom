export const SUBSCRIPTION_DAYS = 30;
export const REMINDER_DAY = 27;
const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionPeriod = {
  startsAt: Date;
  endsAt: Date;
  status?: "ACTIVE" | "EXPIRED";
  reminderSentAt?: Date | null;
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

/**
 * End of a new 30-day period. When the agent still has time left, the new
 * period is added to the current end date so a renewal never shortens the
 * subscription.
 */
export function nextSubscriptionEnd(
  currentEndsAt: Date | null | undefined,
  now: Date = new Date()
): Date {
  const base =
    currentEndsAt && currentEndsAt.getTime() > now.getTime()
      ? currentEndsAt.getTime()
      : now.getTime();
  return new Date(base + SUBSCRIPTION_DAYS * DAY_MS);
}
