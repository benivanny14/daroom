export interface SubscriptionPlanConfig {
  id: string;
  name: string;
  priceTzs: number;
  durationDays: number;
  maxListings: number;
  maxPhotosPerListing: number;
  featuredSlots: number;
  prioritySupport: boolean;
  analytics: boolean;
}

export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlanConfig> = {
  BASIC: {
    id: "BASIC",
    name: "Agent subscription",
    priceTzs: 5000,
    durationDays: 30,
    maxListings: 10,
    maxPhotosPerListing: 10,
    featuredSlots: 0,
    prioritySupport: false,
    analytics: true
  },
  // Legacy plans. They are no longer sold, but existing subscriptions keep
  // their limits until they expire.
  PREMIUM: {
    id: "PREMIUM",
    name: "Premium",
    priceTzs: 15000,
    durationDays: 30,
    maxListings: 20,
    maxPhotosPerListing: 10,
    featuredSlots: 2,
    prioritySupport: true,
    analytics: true
  },
  FEATURED: {
    id: "FEATURED",
    name: "Featured",
    priceTzs: 30000,
    durationDays: 30,
    maxListings: 50,
    maxPhotosPerListing: 10,
    featuredSlots: 5,
    prioritySupport: true,
    analytics: true
  }
};

export function getPlanById(planId: string): SubscriptionPlanConfig | undefined {
  return SUBSCRIPTION_PLANS[planId];
}

/** The only plan sold to agents: TSh 5,000 for 30 days. */
export const AGENT_PLAN_ID = "BASIC";
export const AGENT_PLAN = SUBSCRIPTION_PLANS[AGENT_PLAN_ID];

/** Hard ceiling for photos on any listing, regardless of plan. */
export const MAX_PHOTOS_PER_LISTING = 10;

/**
 * The effective photo limit for a plan. Plans may offer fewer photos, but the
 * global ceiling always applies.
 */
export function photoLimitForPlan(planId?: string | null): number {
  const plan = planId ? getPlanById(planId) : undefined;
  return Math.min(plan?.maxPhotosPerListing ?? MAX_PHOTOS_PER_LISTING, MAX_PHOTOS_PER_LISTING);
}

export function calculateSubscriptionEnd(planId: string): Date {
  const plan = getPlanById(planId);
  if (!plan) throw new Error(`Invalid plan: ${planId}`);

  const now = new Date();
  return new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
}

export function canUserAddListing(
  currentListings: number,
  planId: string
): boolean {
  const plan = getPlanById(planId);
  if (!plan) return false;

  return currentListings < plan.maxListings;
}

export function canAddMorePhotos(
  currentPhotos: number,
  planId: string
): boolean {
  const plan = getPlanById(planId);
  if (!plan) return false;

  return currentPhotos < plan.maxPhotosPerListing;
}

export function hasFeaturedSlots(
  usedFeatured: number,
  planId: string
): boolean {
  const plan = getPlanById(planId);
  if (!plan) return false;

  return usedFeatured < plan.featuredSlots;
}
