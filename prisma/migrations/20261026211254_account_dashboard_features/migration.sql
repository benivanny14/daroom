-- AlterEnum
ALTER TYPE "ListingStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ViewingAppointment" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "Listing_status_expiresAt_idx" ON "Listing"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "ViewingAppointment_userId_scheduledAt_idx" ON "ViewingAppointment"("userId", "scheduledAt");

-- AddForeignKey
ALTER TABLE "ViewingAppointment" ADD CONSTRAINT "ViewingAppointment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
