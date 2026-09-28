-- AlterTable
ALTER TABLE "PreliminaryPages" ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "editedByHand" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "editedById" TEXT,
ADD COLUMN     "sourceHash" TEXT;
