/**
 * Development-only payment simulator. Real deployments must use the provider
 * integration (Selcom) and keep PAYMENTS_MOCK unset.
 */
export function mockPaymentsEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.PAYMENTS_MOCK === "true";
}
