-- Viewings take effect immediately; there is no confirmation step for the agent.
UPDATE "ViewingAppointment" SET "status" = 'CONFIRMED' WHERE "status" = 'PENDING';
ALTER TABLE "ViewingAppointment" ALTER COLUMN "status" SET DEFAULT 'CONFIRMED';
