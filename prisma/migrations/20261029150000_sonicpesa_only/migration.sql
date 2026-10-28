-- SonicPesa is the only payment provider. Remove the unused payment-method
-- catalogue and align the subscription payment record with the SonicPesa order
-- id used by the webhook.
ALTER TABLE "PaymentEvent" DROP COLUMN IF EXISTS "checkoutUrl";
ALTER TABLE "PaymentEvent" ADD COLUMN IF NOT EXISTS "failureReason" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'PaymentEvent' AND column_name = 'providerEventId'
  ) THEN
    ALTER TABLE "PaymentEvent" RENAME COLUMN "providerEventId" TO "providerOrderId";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'PaymentEvent_providerEventId_key') THEN
    ALTER INDEX "PaymentEvent_providerEventId_key" RENAME TO "PaymentEvent_providerOrderId_key";
  END IF;
END $$;

ALTER TABLE "PaymentEvent" ALTER COLUMN "provider" SET DEFAULT 'SONICPESA';

DROP TABLE IF EXISTS "PaymentMethod";
