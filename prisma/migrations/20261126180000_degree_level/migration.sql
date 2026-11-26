-- CreateEnum
CREATE TYPE "DegreeLevel" AS ENUM ('UNDERGRADUATE', 'MASTERS', 'PHD');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "degreeLevel" "DegreeLevel" NOT NULL DEFAULT 'UNDERGRADUATE';

