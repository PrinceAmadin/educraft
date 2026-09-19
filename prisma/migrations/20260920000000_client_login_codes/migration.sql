-- DropIndex
DROP INDEX "Client_userId_key";

-- CreateTable
CREATE TABLE "ClientLoginCode" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientLoginCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientLoginAttempt" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientLoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientLoginCode_clientId_createdAt_idx" ON "ClientLoginCode"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "ClientLoginAttempt_ipHash_kind_createdAt_idx" ON "ClientLoginAttempt"("ipHash", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "Client_userId_idx" ON "Client"("userId");

-- AddForeignKey
ALTER TABLE "ClientLoginCode" ADD CONSTRAINT "ClientLoginCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

