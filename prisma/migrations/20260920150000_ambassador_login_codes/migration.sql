-- CreateTable
CREATE TABLE "AmbassadorLoginCode" (
    "id" TEXT NOT NULL,
    "ambassadorId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmbassadorLoginCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AmbassadorLoginCode_ambassadorId_createdAt_idx" ON "AmbassadorLoginCode"("ambassadorId", "createdAt");

-- AddForeignKey
ALTER TABLE "AmbassadorLoginCode" ADD CONSTRAINT "AmbassadorLoginCode_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "Ambassador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
