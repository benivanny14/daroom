-- AlterTable: phone verification is no longer part of the product
ALTER TABLE "User" DROP COLUMN "isPhoneVerified";

-- AlterEnum: phone OTP tokens are gone. PostgreSQL cannot drop an enum value
-- directly, so recreate the type without PHONE_VERIFY.
ALTER TABLE "AuthToken" ALTER COLUMN purpose TYPE text;
DROP TYPE "TokenPurpose";
CREATE TYPE "TokenPurpose" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');
ALTER TABLE "AuthToken" ALTER COLUMN purpose TYPE "TokenPurpose" USING purpose::"TokenPurpose";

-- AlterEnum: tenants get their own role so agents stay agents
ALTER TYPE "UserRole" ADD VALUE 'TENANT';
