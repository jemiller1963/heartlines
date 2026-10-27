-- Add an explicit questionnaire draft state without reclassifying any existing
-- PENDING / APPROVED / FLAGGED profile rows.
--
-- Rebuild the enum instead of ALTER TYPE ... ADD VALUE + immediate default use;
-- PostgreSQL cannot safely use a just-added enum value in the same transaction
-- on all supported server versions.

ALTER TABLE "Profile" ALTER COLUMN "reviewStatus" DROP DEFAULT;

CREATE TYPE "ReviewStatus_new" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'FLAGGED');

ALTER TABLE "Profile"
  ALTER COLUMN "reviewStatus" TYPE "ReviewStatus_new"
  USING ("reviewStatus"::text::"ReviewStatus_new");

ALTER TYPE "ReviewStatus" RENAME TO "ReviewStatus_old";
ALTER TYPE "ReviewStatus_new" RENAME TO "ReviewStatus";
DROP TYPE "ReviewStatus_old";

ALTER TABLE "Profile" ALTER COLUMN "reviewStatus" SET DEFAULT 'DRAFT';
