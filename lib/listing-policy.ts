export const LISTING_DURATION_DAYS = 60;

export function listingExpiryFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + LISTING_DURATION_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Prisma filter that keeps listings which have not expired yet. Legacy rows
 * without an expiry date are treated as active until the seed backfills them.
 */
export function notExpiredFilter(now: Date = new Date()) {
  return {
    OR: [
      { expiresAt: null },
      { expiresAt: { gt: now } }
    ]
  };
}
