-- Room details the Agent fills in when adding photos: how electricity is
-- billed, whether there is Wi-Fi, and whether the toilet is private or shared.
CREATE TYPE "ElectricityMode" AS ENUM ('INDEPENDENT', 'SHARED');
CREATE TYPE "ToiletMode" AS ENUM ('PRIVATE', 'SHARED');

ALTER TABLE "Listing"
  ADD COLUMN "electricityMode" "ElectricityMode" NOT NULL DEFAULT 'SHARED',
  ADD COLUMN "hasWifi" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "toiletMode" "ToiletMode" NOT NULL DEFAULT 'SHARED';

-- Admins can give an agent free listing/photo access without a subscription.
ALTER TABLE "User" ADD COLUMN "freeAccess" BOOLEAN NOT NULL DEFAULT false;
