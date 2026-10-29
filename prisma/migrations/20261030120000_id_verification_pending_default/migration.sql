-- An identity document must start as PENDING: the old default silently marked
-- every new row as approved.
ALTER TABLE "IdVerification" ALTER COLUMN "status" SET DEFAULT 'PENDING';
