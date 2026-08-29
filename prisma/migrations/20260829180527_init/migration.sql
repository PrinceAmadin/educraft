-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'OPS_MANAGER', 'WORKER', 'AMBASSADOR', 'CLIENT');

-- CreateEnum
CREATE TYPE "UniversityType" AS ENUM ('FEDERAL', 'STATE', 'PRIVATE');

-- CreateEnum
CREATE TYPE "Region" AS ENUM ('SOUTH_SOUTH', 'SOUTH_WEST', 'SOUTH_EAST', 'NORTH_CENTRAL', 'NORTH_WEST', 'NORTH_EAST');

-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('ACADEMIC', 'DESIGN', 'CAREER', 'LEARNING', 'DIGITAL');

-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('FIXED', 'VARIABLE', 'QUOTE');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('NEW', 'DOWNPAYMENT_VERIFIED', 'REQUIREMENTS_CONFIRMED', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_CLIENT_INPUT', 'SUBMITTED', 'IN_QA_REVIEW', 'REVISION_NEEDED', 'APPROVED', 'BALANCE_VERIFIED', 'DELIVERED', 'SUPERVISOR_CORRECTIONS', 'COMPLETED', 'ON_HOLD', 'CANCELLED', 'REFUNDED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('THEORETICAL', 'PRACTICAL', 'DESIGN_BASED', 'SURVEY_BASED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "ReferencingStyle" AS ENUM ('APA_7TH', 'APA_6TH', 'HARVARD', 'IEEE', 'CHICAGO', 'MLA', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DataRequirement" AS ENUM ('PRIMARY', 'SECONDARY', 'BOTH', 'NONE', 'NOT_SURE');

-- CreateEnum
CREATE TYPE "AmbassadorTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('CLIENT_DOWNPAYMENT', 'CLIENT_BALANCE', 'WORKER_PAYOUT', 'AMBASSADOR_COMMISSION', 'EXPENSE', 'REFUND');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('INFLOW', 'OUTFLOW');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "University" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "type" "UniversityType" NOT NULL,
    "state" TEXT NOT NULL,
    "region" "Region" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "entryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "University_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "universityId" TEXT NOT NULL,
    "faculty" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "referredById" TEXT,
    "referralCodeUsed" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "category" "ServiceCategory" NOT NULL,
    "basePrice" DOUBLE PRECISION NOT NULL,
    "pricingModel" "PricingModel" NOT NULL DEFAULT 'FIXED',
    "intakeFormTemplate" TEXT NOT NULL,
    "estimatedDays" INTEGER NOT NULL DEFAULT 7,
    "requiresDownpayment" BOOLEAN NOT NULL DEFAULT true,
    "downpaymentPercentage" DOUBLE PRECISION NOT NULL DEFAULT 45,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "deliverables" TEXT,
    "expressDeliverySurcharge" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceVariant" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceAddon" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ServiceVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "serviceVariantId" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'NEW',
    "isExpressDelivery" BOOLEAN NOT NULL DEFAULT false,
    "projectTitle" TEXT,
    "matricNumber" TEXT,
    "projectPartners" TEXT,
    "supervisorName" TEXT,
    "otherSupervisors" TEXT,
    "hodName" TEXT,
    "projectType" "ProjectType" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "chapterCount" INTEGER,
    "referencingStyle" "ReferencingStyle",
    "minimumPages" TEXT,
    "dataRequirements" "DataRequirement",
    "departmentOutline" TEXT,
    "specialInstructions" TEXT,
    "additionalData" JSONB,
    "dedicationType" TEXT,
    "dedicationDetails" JSONB,
    "acknowledgmentDetails" JSONB,
    "ch3Requirements" TEXT,
    "ch4Data" TEXT,
    "ch4Requirements" TEXT,
    "implementationSpecs" TEXT,
    "clientDeadline" TIMESTAMP(3),
    "internalDeadline" TIMESTAMP(3),
    "deadlinePausedAt" TIMESTAMP(3),
    "deadlinePausedDays" INTEGER NOT NULL DEFAULT 0,
    "price" DOUBLE PRECISION NOT NULL,
    "downpaymentAmount" DOUBLE PRECISION NOT NULL,
    "downpaymentStatus" TEXT NOT NULL DEFAULT 'Unpaid',
    "downpaymentDate" TIMESTAMP(3),
    "downpaymentReference" TEXT,
    "balanceAmount" DOUBLE PRECISION NOT NULL,
    "balanceStatus" TEXT NOT NULL DEFAULT 'Unpaid',
    "balanceDate" TIMESTAMP(3),
    "balanceReference" TEXT,
    "workerId" TEXT,
    "assignedDate" TIMESTAMP(3),
    "workerAccepted" BOOLEAN NOT NULL DEFAULT false,
    "workerAcceptedDate" TIMESTAMP(3),
    "qaReviewerId" TEXT,
    "qaStatus" TEXT,
    "qaScore" INTEGER,
    "qaNotes" TEXT,
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "deliveryDate" TIMESTAMP(3),
    "clientFeedback" TEXT,
    "supervisorCorrections" BOOLEAN NOT NULL DEFAULT false,
    "supervisorCorrectionDetails" TEXT,
    "supervisorCorrectionStatus" TEXT,
    "supervisorCorrectionCount" INTEGER NOT NULL DEFAULT 0,
    "finalCompletionDate" TIMESTAMP(3),
    "ambassadorId" TEXT,
    "ambassadorCommRate" DOUBLE PRECISION,
    "ambassadorCommission" DOUBLE PRECISION,
    "ambassadorCommPaid" BOOLEAN NOT NULL DEFAULT false,
    "workerPayoutRate" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "workerPayout" DOUBLE PRECISION,
    "workerPayoutPaid" BOOLEAN NOT NULL DEFAULT false,
    "educraftRevenue" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectFile" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "fileType" TEXT,
    "category" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectStatusLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fromStatus" "ProjectStatus" NOT NULL,
    "toStatus" "ProjectStatus" NOT NULL,
    "changedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "specialties" TEXT[],
    "skills" TEXT[],
    "serviceTypes" TEXT[],
    "educationLevel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "maxConcurrentProjects" INTEGER NOT NULL DEFAULT 3,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "accountName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ambassador" (
    "id" TEXT NOT NULL,
    "ambassadorId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "universityId" TEXT NOT NULL,
    "department" TEXT,
    "level" TEXT,
    "referralCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "tier" "AmbassadorTier" NOT NULL DEFAULT 'BRONZE',
    "bankName" TEXT,
    "accountNumber" TEXT,
    "accountName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "Ambassador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "type" "PaymentType" NOT NULL,
    "direction" "PaymentDirection" NOT NULL,
    "projectId" TEXT,
    "personName" TEXT,
    "personRole" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT,
    "reference" TEXT,
    "confirmedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "notes" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "frequency" TEXT,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "University_abbreviation_key" ON "University"("abbreviation");

-- CreateIndex
CREATE INDEX "University_region_idx" ON "University"("region");

-- CreateIndex
CREATE INDEX "University_status_idx" ON "University"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Client_clientId_key" ON "Client"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_userId_key" ON "Client"("userId");

-- CreateIndex
CREATE INDEX "Client_universityId_idx" ON "Client"("universityId");

-- CreateIndex
CREATE INDEX "Client_referredById_idx" ON "Client"("referredById");

-- CreateIndex
CREATE INDEX "Client_phone_idx" ON "Client"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Service_serviceCode_key" ON "Service"("serviceCode");

-- CreateIndex
CREATE INDEX "Service_category_isActive_idx" ON "Service"("category", "isActive");

-- CreateIndex
CREATE INDEX "ServiceVariant_serviceId_idx" ON "ServiceVariant"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_projectId_key" ON "Project"("projectId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- CreateIndex
CREATE INDEX "Project_workerId_idx" ON "Project"("workerId");

-- CreateIndex
CREATE INDEX "Project_ambassadorId_idx" ON "Project"("ambassadorId");

-- CreateIndex
CREATE INDEX "Project_serviceId_idx" ON "Project"("serviceId");

-- CreateIndex
CREATE INDEX "Project_internalDeadline_idx" ON "Project"("internalDeadline");

-- CreateIndex
CREATE INDEX "Project_createdAt_idx" ON "Project"("createdAt");

-- CreateIndex
CREATE INDEX "ProjectFile_projectId_category_idx" ON "ProjectFile"("projectId", "category");

-- CreateIndex
CREATE INDEX "ProjectStatusLog_projectId_createdAt_idx" ON "ProjectStatusLog"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_workerId_key" ON "Worker"("workerId");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_userId_key" ON "Worker"("userId");

-- CreateIndex
CREATE INDEX "Worker_status_idx" ON "Worker"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Ambassador_ambassadorId_key" ON "Ambassador"("ambassadorId");

-- CreateIndex
CREATE UNIQUE INDEX "Ambassador_referralCode_key" ON "Ambassador"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "Ambassador_userId_key" ON "Ambassador"("userId");

-- CreateIndex
CREATE INDEX "Ambassador_universityId_idx" ON "Ambassador"("universityId");

-- CreateIndex
CREATE INDEX "Ambassador_status_idx" ON "Ambassador"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paymentId_key" ON "Payment"("paymentId");

-- CreateIndex
CREATE INDEX "Payment_type_status_idx" ON "Payment"("type", "status");

-- CreateIndex
CREATE INDEX "Payment_projectId_idx" ON "Payment"("projectId");

-- CreateIndex
CREATE INDEX "Payment_date_idx" ON "Payment"("date");

-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "Expense"("date");

-- CreateIndex
CREATE INDEX "Expense_category_idx" ON "Expense"("category");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "Ambassador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceVariant" ADD CONSTRAINT "ServiceVariant_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "Ambassador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStatusLog" ADD CONSTRAINT "ProjectStatusLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStatusLog" ADD CONSTRAINT "ProjectStatusLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ambassador" ADD CONSTRAINT "Ambassador_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ambassador" ADD CONSTRAINT "Ambassador_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
