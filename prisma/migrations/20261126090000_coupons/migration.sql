-- CreateEnum
CREATE TYPE "CouponStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'REVOKED');

-- AlterTable
ALTER TABLE "PendingIntake" ADD COLUMN     "broughtByCouponId" TEXT,
ADD COLUMN     "couponId" TEXT,
ADD COLUMN     "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "broughtByCouponId" TEXT,
ADD COLUMN     "couponId" TEXT,
ADD COLUMN     "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "workerPayoutRate" SET DEFAULT 35;

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,
    "percentOff" INTEGER,
    "amountOffNgn" INTEGER,
    "friendPercentOff" INTEGER,
    "ownerClientId" TEXT,
    "serviceCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minOrderNgn" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "maxRedemptions" INTEGER,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "expectedReferrals" INTEGER,
    "tagsReferrals" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "status" "CouponStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdByRole" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "overrideCap" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "listPrice" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL,
    "payablePrice" DOUBLE PRECISION NOT NULL,
    "overLimit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_status_idx" ON "Coupon"("status");

-- CreateIndex
CREATE INDEX "Coupon_ownerClientId_idx" ON "Coupon"("ownerClientId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_projectId_key" ON "CouponRedemption"("projectId");

-- CreateIndex
CREATE INDEX "CouponRedemption_couponId_idx" ON "CouponRedemption"("couponId");

-- CreateIndex
CREATE INDEX "CouponRedemption_clientId_idx" ON "CouponRedemption"("clientId");

-- CreateIndex
CREATE INDEX "Project_couponId_idx" ON "Project"("couponId");

-- CreateIndex
CREATE INDEX "Project_broughtByCouponId_idx" ON "Project"("broughtByCouponId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_broughtByCouponId_fkey" FOREIGN KEY ("broughtByCouponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_ownerClientId_fkey" FOREIGN KEY ("ownerClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

