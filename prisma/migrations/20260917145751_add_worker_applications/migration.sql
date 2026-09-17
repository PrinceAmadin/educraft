-- AlterTable
ALTER TABLE "Worker" ADD COLUMN     "updatedById" TEXT,
ADD COLUMN     "updatedByRole" TEXT;

-- CreateTable
CREATE TABLE "WorkerApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "educationLevel" TEXT,
    "specialties" TEXT[],
    "skills" TEXT[],
    "bankName" TEXT,
    "accountNumber" TEXT,
    "accountName" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "workerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkerApplication_userId_key" ON "WorkerApplication"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerApplication_workerId_key" ON "WorkerApplication"("workerId");

-- CreateIndex
CREATE INDEX "WorkerApplication_status_idx" ON "WorkerApplication"("status");

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerApplication" ADD CONSTRAINT "WorkerApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerApplication" ADD CONSTRAINT "WorkerApplication_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
