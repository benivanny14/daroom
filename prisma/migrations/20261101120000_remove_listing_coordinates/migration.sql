-- DarRoom does not offer a map, so the listing coordinates are no longer used.
ALTER TABLE "Listing" DROP COLUMN IF EXISTS "latitude";
ALTER TABLE "Listing" DROP COLUMN IF EXISTS "longitude";
