-- Public supervisor package URL + access counters.
-- Every ResearchJob gets a shareToken minted at PASS-time; the token is the credential
-- for the public /research/[token] page. Counters + timestamps let the COO see whether
-- the supervisor actually opened it.
ALTER TABLE "ResearchJob"
  ADD COLUMN "shareToken" TEXT,
  ADD COLUMN "supervisorViews" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "supervisorFirstViewedAt" TIMESTAMP(3),
  ADD COLUMN "supervisorLastViewedAt" TIMESTAMP(3),
  ADD COLUMN "supervisorPdfDownloads" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "ResearchJob_shareToken_key" ON "ResearchJob"("shareToken");
