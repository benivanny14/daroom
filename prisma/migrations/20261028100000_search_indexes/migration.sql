-- Trigram support so the public search (`ILIKE '%term%'`) stops scanning the table.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN indexes backing the insensitive contains() search on listing text.
CREATE INDEX IF NOT EXISTS "Listing_title_trgm_idx" ON "Listing" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Listing_description_trgm_idx" ON "Listing" USING gin ("description" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Neighborhood_name_trgm_idx" ON "Neighborhood" USING gin ("name" gin_trgm_ops);

-- Sort orders offered by the public listings endpoint (newest / price).
CREATE INDEX IF NOT EXISTS "Listing_status_createdAt_idx" ON "Listing" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Listing_status_priceTzs_idx" ON "Listing" ("status", "priceTzs");
