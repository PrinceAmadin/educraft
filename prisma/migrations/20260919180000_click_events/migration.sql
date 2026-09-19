-- CreateEnum
CREATE TYPE "ClickQuality" AS ENUM ('UNIQUE', 'RETURN', 'DUPLICATE', 'BOT');

-- CreateTable
CREATE TABLE "ClickEvent" (
    "id" TEXT NOT NULL,
    "slotCode" TEXT NOT NULL,
    "ambassadorId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash" TEXT NOT NULL,
    "country" TEXT,
    "city" TEXT,
    "region" TEXT,
    "regionCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "device" TEXT,
    "os" TEXT,
    "browser" TEXT,
    "referrer" TEXT,
    "referrerSource" TEXT,
    "quality" "ClickQuality" NOT NULL DEFAULT 'UNIQUE',
    "isFraud" BOOLEAN NOT NULL DEFAULT false,
    "fraudReason" TEXT,
    "isTestClick" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "ClickEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClickEvent_slotCode_timestamp_idx" ON "ClickEvent"("slotCode", "timestamp");

-- CreateIndex
CREATE INDEX "ClickEvent_ambassadorId_timestamp_idx" ON "ClickEvent"("ambassadorId", "timestamp");

-- CreateIndex
CREATE INDEX "ClickEvent_timestamp_idx" ON "ClickEvent"("timestamp");

-- CreateIndex
CREATE INDEX "ClickEvent_slotCode_ipHash_timestamp_idx" ON "ClickEvent"("slotCode", "ipHash", "timestamp");

-- CreateIndex
CREATE INDEX "ClickEvent_ambassadorId_isTestClick_archivedAt_idx" ON "ClickEvent"("ambassadorId", "isTestClick", "archivedAt");

-- AddForeignKey
ALTER TABLE "ClickEvent" ADD CONSTRAINT "ClickEvent_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "Ambassador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

