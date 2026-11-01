-- Tenants pay rent directly to the Agent on WhatsApp. DarRoom no longer
-- collects rent, so the rent payment table and its status enum are removed.
DROP TABLE IF EXISTS "RentPayment";
DROP TYPE IF EXISTS "RentPaymentStatus";
