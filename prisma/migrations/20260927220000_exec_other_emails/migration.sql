-- AlterTable
ALTER TABLE "ExecProfile" ADD COLUMN     "otherEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];
