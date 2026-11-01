/** Canonical public origin. Keep this in one place so metadata, sitemap and
 * structured data never drift apart. */
export const SITE_URL = (process.env.APP_URL || "https://darroom.site").replace(/\/$/, "");
export const SITE_NAME = "DarRoom";
export const SITE_DESCRIPTION =
  "Find rooms to rent in Dar es Salaam. Clear prices and terms. Contact an Agent directly on WhatsApp. Searching is free.";
