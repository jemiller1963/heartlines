-- Phase 2 private-ID data minimization.
-- Raw government-ID Blob URLs are retained only while verification is pending.

ALTER TABLE "id_verification"
  ALTER COLUMN "imagePath" DROP NOT NULL,
  ADD COLUMN "reviewedAt" TIMESTAMP(3);
