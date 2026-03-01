/*
  Warnings:

  - The values [PROCESSING] on the enum `FileStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "FileStatus_new" AS ENUM ('STARTING', 'UPLOADED', 'PROCESSED', 'FAILED');
ALTER TABLE "public"."file" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "file" ALTER COLUMN "status" TYPE "FileStatus_new" USING ("status"::text::"FileStatus_new");
ALTER TYPE "FileStatus" RENAME TO "FileStatus_old";
ALTER TYPE "FileStatus_new" RENAME TO "FileStatus";
DROP TYPE "public"."FileStatus_old";
ALTER TABLE "file" ALTER COLUMN "status" SET DEFAULT 'STARTING';
COMMIT;
