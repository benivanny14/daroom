-- Mobile-money rent payments collected through SonicPesa.
CREATE TYPE "RentPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED');

CREATE TABLE "RentPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listingId" TEXT,
    "rentReference" TEXT,
    "amountTzs" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'SONICPESA',
    "providerOrderId" TEXT,
    "providerTransId" TEXT,
    "providerReference" TEXT,
    "channel" TEXT,
    "status" "RentPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "rawPayload" JSONB,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RentPayment_providerOrderId_key" ON "RentPayment"("providerOrderId");
CREATE UNIQUE INDEX "RentPayment_providerTransId_key" ON "RentPayment"("providerTransId");
CREATE INDEX "RentPayment_tenantId_createdAt_idx" ON "RentPayment"("tenantId", "createdAt");
CREATE INDEX "RentPayment_status_createdAt_idx" ON "RentPayment"("status", "createdAt");
CREATE INDEX "RentPayment_listingId_idx" ON "RentPayment"("listingId");

ALTER TABLE "RentPayment" ADD CONSTRAINT "RentPayment_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RentPayment" ADD CONSTRAINT "RentPayment_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
