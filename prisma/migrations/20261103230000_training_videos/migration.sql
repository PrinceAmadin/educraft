-- CreateTable
CREATE TABLE "TrainingVideo" (
    "id" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "episodeNo" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "videoUrl" TEXT NOT NULL DEFAULT '',
    "posterUrl" TEXT NOT NULL DEFAULT '',
    "durationSeconds" INTEGER,
    "requiredForGate" BOOLEAN NOT NULL DEFAULT true,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "quizPassPercent" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingWatch" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secondsWatched" INTEGER NOT NULL DEFAULT 0,
    "durationSeconds" INTEGER,
    "startedAt" TIMESTAMP(3),
    "watchedAt" TIMESTAMP(3),
    "quizPassedAt" TIMESTAMP(3),

    CONSTRAINT "TrainingWatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingVideo_audience_isPublished_idx" ON "TrainingVideo"("audience", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingVideo_audience_episodeNo_key" ON "TrainingVideo"("audience", "episodeNo");

-- CreateIndex
CREATE INDEX "TrainingWatch_userId_idx" ON "TrainingWatch"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingWatch_videoId_userId_key" ON "TrainingWatch"("videoId", "userId");

-- AddForeignKey
ALTER TABLE "TrainingWatch" ADD CONSTRAINT "TrainingWatch_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "TrainingVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingWatch" ADD CONSTRAINT "TrainingWatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

