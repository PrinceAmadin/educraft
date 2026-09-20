-- One login can own a Worker and an Ambassador profile; reset codes are keyed by email.
DROP TABLE "AmbassadorLoginCode";

CREATE TABLE "PortalLoginCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalLoginCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PortalLoginCode_email_createdAt_idx" ON "PortalLoginCode"("email", "createdAt");
