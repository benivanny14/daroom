-- One guest could previously post the same review repeatedly by changing the
-- display name. The keyed address hash makes that limit enforceable.
ALTER TABLE "Review" ADD COLUMN "authorIpHash" TEXT;

CREATE INDEX "Review_listingId_authorIpHash_idx" ON "Review"("listingId", "authorIpHash");
