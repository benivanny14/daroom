-- Listings and ID verifications go live immediately; no approval step.
ALTER TABLE "Listing" ALTER COLUMN "status" SET DEFAULT 'APPROVED';
ALTER TABLE "IdVerification" ALTER COLUMN "status" SET DEFAULT 'APPROVED';
