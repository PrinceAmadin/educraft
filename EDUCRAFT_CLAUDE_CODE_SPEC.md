# EduCraft WorkBase — Claude Code Implementation Spec

## FOR CLAUDE CODE: PROJECT CONTEXT

You are building **EduCraft WorkBase** — a full-stack operations platform for EduCraft, a Nigerian academic services company. This is a **brand new project**, NOT built on top of any existing codebase. There is an existing Ambassador Panel app (Vercel-hosted) that will be deprecated and replaced by this system. All ambassador features are rebuilt as one module inside this larger platform.

EduCraft provides academic writing, presentations, editing, and other services to university students across Nigeria. The platform serves four user roles: Super Admin (founders), Workers (freelancers who produce the work), Ambassadors (university students who refer clients), and Clients (students who need services).

The business processes ~50-100+ projects per month and is scaling toward 15,000 projects/year (₦1 billion revenue target). Every design decision must support that scale.

---

## 1. TECH STACK

| Layer | Technology | Reason |
|---|---|---|
| Framework | Next.js 14+ (App Router) | Full-stack, SSR for public pages, great DX |
| Language | TypeScript | Type safety across the full stack |
| Database | PostgreSQL | Relational data model |
| ORM | Prisma | Type-safe queries, easy migrations |
| Auth | NextAuth.js (Auth.js v5) | Role-based auth, multiple providers |
| Styling | Tailwind CSS | Utility-first, dark mode support built in |
| UI Components | shadcn/ui | Accessible, customizable, dark mode native |
| Charts | Recharts | Financial dashboard charts |
| File Storage | AWS S3 (or Cloudinary) | Client uploads, deliverables |
| Forms | React Hook Form + Zod | Multi-step forms with validation |
| State | Zustand (if needed) | Lightweight global state |
| Icons | Lucide React | Clean, consistent icon set |
| Hosting | Vercel (app) + Railway/Supabase (DB) | Affordable, scalable |
| Notifications | In-app (DB-backed) | Phase 1; WhatsApp API in Phase 2 |

---

## 2. PROJECT STRUCTURE

```
educraft-workbase/
├── prisma/
│   ├── schema.prisma          # Complete database schema
│   ├── seed.ts                # Seed data (services, universities, admin users)
│   └── migrations/
├── public/
│   ├── logo.svg               # EduCraft logo
│   └── og-image.png           # Social sharing image
├── src/
│   ├── app/
│   │   ├── (public)/                    # PUBLIC PAGES (no auth)
│   │   │   ├── page.tsx                 # Landing/home page
│   │   │   ├── services/page.tsx        # Service catalog
│   │   │   ├── intake/                  # Client intake forms
│   │   │   │   ├── page.tsx             # Service selection page
│   │   │   │   ├── [serviceCode]/       # Dynamic form per service type
│   │   │   │   │   └── page.tsx         # Multi-step form
│   │   │   │   ├── ch34/[projectId]/    # Mid-project Ch.3/4 form
│   │   │   │   │   └── page.tsx
│   │   │   │   └── success/page.tsx     # Submission confirmation
│   │   │   ├── track/[projectId]/       # Public project status tracker
│   │   │   │   └── page.tsx
│   │   │   └── apply/page.tsx           # Ambassador application form
│   │   │
│   │   ├── (auth)/                      # AUTH PAGES
│   │   │   ├── login/page.tsx
│   │   │   └── layout.tsx
│   │   │
│   │   ├── (dashboard)/                 # AUTHENTICATED DASHBOARD
│   │   │   ├── layout.tsx               # Sidebar + topbar layout
│   │   │   │
│   │   │   ├── admin/                   # SUPER ADMIN VIEWS
│   │   │   │   ├── page.tsx             # Command Center (home dashboard)
│   │   │   │   ├── projects/
│   │   │   │   │   ├── page.tsx         # Projects list (filterable table)
│   │   │   │   │   ├── [id]/page.tsx    # Project detail (tabbed view)
│   │   │   │   │   └── new/page.tsx     # Manual project creation
│   │   │   │   ├── clients/
│   │   │   │   │   ├── page.tsx         # Clients list
│   │   │   │   │   └── [id]/page.tsx    # Client profile
│   │   │   │   ├── workers/
│   │   │   │   │   ├── page.tsx         # Workers list
│   │   │   │   │   ├── [id]/page.tsx    # Worker profile
│   │   │   │   │   └── new/page.tsx     # Add worker
│   │   │   │   ├── ambassadors/
│   │   │   │   │   ├── page.tsx         # Ambassadors list
│   │   │   │   │   ├── [id]/page.tsx    # Ambassador profile
│   │   │   │   │   ├── new/page.tsx     # Add ambassador
│   │   │   │   │   └── schools/page.tsx # School coverage view
│   │   │   │   ├── qa/
│   │   │   │   │   ├── page.tsx         # QA review queue
│   │   │   │   │   └── [id]/page.tsx    # QA review interface
│   │   │   │   ├── finance/
│   │   │   │   │   ├── page.tsx         # Financial dashboard
│   │   │   │   │   ├── payouts/page.tsx # Payout queue
│   │   │   │   │   └── expenses/page.tsx # Expense tracking
│   │   │   │   ├── reports/page.tsx     # Reports & analytics
│   │   │   │   └── settings/
│   │   │   │       ├── page.tsx         # General settings
│   │   │   │       ├── services/page.tsx # Manage services & pricing
│   │   │   │       └── team/page.tsx    # Manage admin users
│   │   │   │
│   │   │   ├── worker/                  # WORKER VIEWS
│   │   │   │   ├── page.tsx             # Worker dashboard (my assignments)
│   │   │   │   ├── projects/
│   │   │   │   │   └── [id]/page.tsx    # Assignment detail
│   │   │   │   ├── earnings/page.tsx    # My earnings & payouts
│   │   │   │   └── profile/page.tsx     # My profile & stats
│   │   │   │
│   │   │   └── ambassador/             # AMBASSADOR VIEWS
│   │   │       ├── page.tsx             # Ambassador dashboard
│   │   │       ├── referrals/page.tsx   # My referrals list
│   │   │       ├── commissions/page.tsx # My commissions & payouts
│   │   │       ├── leaderboard/page.tsx # Ambassador leaderboard
│   │   │       └── profile/page.tsx     # My profile & bank details
│   │   │
│   │   ├── api/                         # API ROUTES
│   │   │   ├── auth/[...nextauth]/
│   │   │   ├── intake/route.ts          # Public: submit intake form
│   │   │   ├── intake/ch34/[id]/route.ts
│   │   │   ├── projects/route.ts
│   │   │   ├── projects/[id]/route.ts
│   │   │   ├── projects/[id]/status/route.ts
│   │   │   ├── projects/[id]/assign/route.ts
│   │   │   ├── projects/pipeline/route.ts
│   │   │   ├── clients/route.ts
│   │   │   ├── workers/route.ts
│   │   │   ├── workers/recommend/[projectId]/route.ts
│   │   │   ├── ambassadors/route.ts
│   │   │   ├── payments/route.ts
│   │   │   ├── payouts/route.ts
│   │   │   ├── dashboard/route.ts
│   │   │   ├── finance/route.ts
│   │   │   ├── services/route.ts
│   │   │   └── universities/route.ts
│   │   │
│   │   ├── layout.tsx                   # Root layout (fonts, providers)
│   │   └── globals.css                  # Global styles + Tailwind
│   │
│   ├── components/
│   │   ├── ui/                          # shadcn/ui components
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx              # Dashboard sidebar navigation
│   │   │   ├── Topbar.tsx               # Top navigation bar
│   │   │   ├── MobileNav.tsx            # Mobile bottom navigation
│   │   │   └── ThemeToggle.tsx          # Dark/light mode switch
│   │   ├── dashboard/
│   │   │   ├── StatsCard.tsx            # Metric card (revenue, projects, etc.)
│   │   │   ├── PipelineBar.tsx          # Project pipeline visualization
│   │   │   ├── ActivityFeed.tsx         # Recent activity list
│   │   │   ├── AlertsList.tsx           # Action items / alerts
│   │   │   └── RevenueChart.tsx         # Revenue over time chart
│   │   ├── projects/
│   │   │   ├── ProjectsTable.tsx        # Filterable projects table
│   │   │   ├── ProjectDetail.tsx        # Project detail with tabs
│   │   │   ├── ProjectTimeline.tsx      # Status change timeline
│   │   │   ├── WorkerAssignment.tsx     # Worker recommendation + assign
│   │   │   ├── StatusBadge.tsx          # Color-coded status pill
│   │   │   └── PaymentStatus.tsx        # Payment progress indicator
│   │   ├── forms/
│   │   │   ├── IntakeFormEngine.tsx     # Multi-step form engine
│   │   │   ├── FormStep.tsx             # Single form step container
│   │   │   ├── FormProgress.tsx         # Step progress indicator
│   │   │   ├── ServiceSelector.tsx      # Service selection with pricing
│   │   │   ├── DedicationForm.tsx       # Dedication section (FYP)
│   │   │   └── FileUpload.tsx           # Drag-and-drop file upload
│   │   ├── finance/
│   │   │   ├── RevenueCards.tsx
│   │   │   ├── CashFlowBreakdown.tsx
│   │   │   ├── PayoutQueue.tsx
│   │   │   └── BusinessMetrics.tsx
│   │   ├── qa/
│   │   │   ├── QAQueue.tsx
│   │   │   └── QAChecklist.tsx
│   │   └── shared/
│   │       ├── DataTable.tsx            # Reusable filterable/sortable table
│   │       ├── SearchInput.tsx
│   │       ├── EmptyState.tsx
│   │       ├── LoadingState.tsx
│   │       └── ConfirmDialog.tsx
│   │
│   ├── lib/
│   │   ├── db.ts                        # Prisma client instance
│   │   ├── auth.ts                      # Auth configuration
│   │   ├── utils.ts                     # Utility functions
│   │   ├── constants.ts                 # App-wide constants
│   │   ├── validations/                 # Zod schemas
│   │   │   ├── project.ts
│   │   │   ├── client.ts
│   │   │   ├── intake.ts
│   │   │   └── payment.ts
│   │   └── services/                    # Business logic
│   │       ├── projects.ts              # Project CRUD + pipeline logic
│   │       ├── assignments.ts           # Worker matching + assignment
│   │       ├── payments.ts              # Payment processing logic
│   │       ├── commissions.ts           # Commission calculation
│   │       ├── notifications.ts         # Notification creation
│   │       └── analytics.ts             # Dashboard data aggregation
│   │
│   ├── hooks/                           # Custom React hooks
│   │   ├── useProjects.ts
│   │   ├── useDashboard.ts
│   │   └── useNotifications.ts
│   │
│   └── types/                           # TypeScript types
│       ├── project.ts
│       ├── user.ts
│       └── finance.ts
│
├── .env.local                           # Environment variables
├── tailwind.config.ts
├── next.config.ts
├── package.json
└── README.md
```

---

## 3. DATABASE SCHEMA (Prisma)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── AUTH & USERS ───────────────────────────────────────

enum UserRole {
  SUPER_ADMIN
  OPS_MANAGER
  WORKER
  AMBASSADOR
  CLIENT
}

model User {
  id             String    @id @default(cuid())
  email          String    @unique
  phone          String?   @unique
  passwordHash   String
  role           UserRole
  isActive       Boolean   @default(true)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  // Role-specific profile links
  workerProfile      Worker?
  ambassadorProfile  Ambassador?
  clientProfile      Client?

  // Activity
  notifications      Notification[]
  statusChanges      ProjectStatusLog[]  @relation("ChangedBy")
  paymentsConfirmed  Payment[]           @relation("ConfirmedBy")
}

// ─── UNIVERSITIES ───────────────────────────────────────

enum UniversityType {
  FEDERAL
  STATE
  PRIVATE
}

enum Region {
  SOUTH_SOUTH
  SOUTH_WEST
  SOUTH_EAST
  NORTH_CENTRAL
  NORTH_WEST
  NORTH_EAST
}

model University {
  id            String         @id @default(cuid())
  name          String
  abbreviation  String         @unique
  type          UniversityType
  state         String
  region        Region
  status        String         @default("Active")  // Active, Prospecting, Inactive
  entryDate     DateTime?
  createdAt     DateTime       @default(now())

  clients       Client[]
  ambassadors   Ambassador[]
}

// ─── CLIENTS ────────────────────────────────────────────

model Client {
  id               String     @id @default(cuid())
  clientId         String     @unique  // EC-C-XXXXX
  fullName         String
  phone            String
  email            String?
  universityId     String
  university       University @relation(fields: [universityId], references: [id])
  faculty          String
  department       String
  level            String
  referredById     String?
  referredBy       Ambassador? @relation(fields: [referredById], references: [id])
  referralCodeUsed String?
  status           String     @default("Active")
  notes            String?
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt

  userId           String?    @unique
  user             User?      @relation(fields: [userId], references: [id])

  projects         Project[]
}

// ─── SERVICES ───────────────────────────────────────────

enum ServiceCategory {
  ACADEMIC
  DESIGN
  CAREER
  LEARNING
  DIGITAL
}

enum PricingModel {
  FIXED
  VARIABLE
  QUOTE
}

model Service {
  id                      String          @id @default(cuid())
  serviceCode             String          @unique
  serviceName             String
  category                ServiceCategory
  basePrice               Float
  pricingModel            PricingModel    @default(FIXED)
  intakeFormTemplate       String          // Which form flow to use
  estimatedDays           Int             @default(7)
  requiresDownpayment     Boolean         @default(true)
  downpaymentPercentage   Float           @default(45)
  isActive                Boolean         @default(true)
  description             String?
  deliverables            String?
  expressDeliverySurcharge Float?
  sortOrder               Int             @default(0)
  createdAt               DateTime        @default(now())
  updatedAt               DateTime        @updatedAt

  // Sub-options for this service (e.g., "with Data Analysis" vs "without")
  variants                ServiceVariant[]
  projects                Project[]
}

model ServiceVariant {
  id          String  @id @default(cuid())
  serviceId   String
  service     Service @relation(fields: [serviceId], references: [id])
  name        String  // e.g., "With Data Analysis"
  priceAddon  Float   // Additional cost on top of base price
  isActive    Boolean @default(true)
  sortOrder   Int     @default(0)
}

// ─── PROJECTS ───────────────────────────────────────────

enum ProjectStatus {
  NEW
  DOWNPAYMENT_VERIFIED
  REQUIREMENTS_CONFIRMED
  ASSIGNED
  IN_PROGRESS
  AWAITING_CLIENT_INPUT
  SUBMITTED
  IN_QA_REVIEW
  REVISION_NEEDED
  APPROVED
  BALANCE_VERIFIED
  DELIVERED
  SUPERVISOR_CORRECTIONS
  COMPLETED
  ON_HOLD
  CANCELLED
  REFUNDED
  DISPUTED
}

enum ProjectType {
  THEORETICAL
  PRACTICAL
  DESIGN_BASED
  SURVEY_BASED
  NOT_APPLICABLE
}

enum ReferencingStyle {
  APA_7TH
  APA_6TH
  HARVARD
  IEEE
  CHICAGO
  MLA
  CUSTOM
}

enum DataRequirement {
  PRIMARY
  SECONDARY
  BOTH
  NONE
  NOT_SURE
}

model Project {
  id                    String        @id @default(cuid())
  projectId             String        @unique  // EC-XXXXX
  clientId              String
  client                Client        @relation(fields: [clientId], references: [id])
  serviceId             String
  service               Service       @relation(fields: [serviceId], references: [id])
  serviceVariantId      String?

  // ── Status ──
  status                ProjectStatus @default(NEW)
  isExpressDelivery     Boolean       @default(false)

  // ── Academic fields ──
  projectTitle          String?
  matricNumber          String?
  projectPartners       String?
  supervisorName        String?
  otherSupervisors      String?
  hodName               String?
  projectType           ProjectType   @default(NOT_APPLICABLE)
  chapterCount          Int?
  referencingStyle      ReferencingStyle?
  minimumPages          String?       // "70", "80", "90", "Above 90", "Not Specified"
  dataRequirements      DataRequirement?
  departmentOutline     String?       // Text description or file reference
  specialInstructions   String?

  // ── Non-academic fields (varies by service type) ──
  additionalData        Json?         // Flexible JSON for service-specific data
                                      // CV: work experience, skills, etc.
                                      // Presentation: slide count, style prefs
                                      // Letter: letter type, recipient details

  // ── Preliminary pages (FYP) ──
  dedicationType        String?
  dedicationDetails     Json?         // Structured: [{name, relationship, message}]
  acknowledgmentDetails Json?         // Structured: [{name, role, note}]

  // ── Mid-project collection ──
  ch3Requirements       String?
  ch4Data               String?
  ch4Requirements       String?
  implementationSpecs   String?

  // ── Deadlines ──
  clientDeadline        DateTime?
  internalDeadline      DateTime?
  deadlinePausedAt      DateTime?     // Set when AWAITING_CLIENT_INPUT
  deadlinePausedDays    Int           @default(0)

  // ── Pricing ──
  price                 Float
  downpaymentAmount     Float
  downpaymentStatus     String        @default("Unpaid")  // Unpaid, Paid, Verified
  downpaymentDate       DateTime?
  downpaymentReference  String?
  balanceAmount         Float
  balanceStatus         String        @default("Unpaid")
  balanceDate           DateTime?
  balanceReference      String?

  // ── Assignment ──
  workerId              String?
  worker                Worker?       @relation(fields: [workerId], references: [id])
  assignedDate          DateTime?
  workerAccepted        Boolean       @default(false)
  workerAcceptedDate    DateTime?

  // ── QA ──
  qaReviewerId          String?
  qaStatus              String?       // Pending, Passed, Failed, Revision Needed
  qaScore               Int?
  qaNotes               String?
  revisionCount         Int           @default(0)

  // ── Delivery ──
  deliveryDate          DateTime?
  clientFeedback        String?       // Not Rated, Satisfied, Neutral, Unsatisfied
  supervisorCorrections    Boolean    @default(false)
  supervisorCorrectionDetails String?
  supervisorCorrectionStatus  String? // None, Pending, In Progress, Completed
  supervisorCorrectionCount   Int     @default(0)
  finalCompletionDate   DateTime?

  // ── Commission ──
  ambassadorId          String?
  ambassador            Ambassador?   @relation(fields: [ambassadorId], references: [id])
  ambassadorCommRate    Float?
  ambassadorCommission  Float?
  ambassadorCommPaid    Boolean       @default(false)
  workerPayoutRate      Float         @default(40)
  workerPayout          Float?
  workerPayoutPaid      Boolean       @default(false)
  educraftRevenue       Float?

  // ── Timestamps ──
  createdAt             DateTime      @default(now())
  updatedAt             DateTime      @updatedAt

  // ── Relations ──
  files                 ProjectFile[]
  statusLog             ProjectStatusLog[]
  payments              Payment[]
}

model ProjectFile {
  id          String   @id @default(cuid())
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id])
  fileName    String
  fileUrl     String   // S3/Cloudinary URL
  fileSize    Int?     // bytes
  fileType    String?  // MIME type
  category    String   // from_client, from_worker, qa_reviewed, delivered, supervisor_correction, ch34_data, department_outline
  uploadedBy  String?  // User ID or "client" for public uploads
  createdAt   DateTime @default(now())
}

model ProjectStatusLog {
  id              String   @id @default(cuid())
  projectId       String
  project         Project  @relation(fields: [projectId], references: [id])
  fromStatus      ProjectStatus
  toStatus        ProjectStatus
  changedById     String?
  changedBy       User?    @relation("ChangedBy", fields: [changedById], references: [id])
  notes           String?
  createdAt       DateTime @default(now())
}

// ─── WORKERS ────────────────────────────────────────────

model Worker {
  id                      String    @id @default(cuid())
  workerId                String    @unique  // EC-W-XXXXX
  fullName                String
  phone                   String
  email                   String?
  specialties             String[]  // Array of department names
  skills                  String[]  // Array of skills (SPSS, MATLAB, etc.)
  serviceTypes            String[]  // Array of service codes they can handle
  educationLevel          String?   // BSc, MSc, PhD
  status                  String    @default("Active")  // Active, On Break, Suspended, Terminated
  maxConcurrentProjects   Int       @default(3)
  bankName                String?
  accountNumber           String?
  accountName             String?
  notes                   String?
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt

  userId                  String?   @unique
  user                    User?     @relation(fields: [userId], references: [id])

  projects                Project[]
}

// ─── AMBASSADORS ────────────────────────────────────────

enum AmbassadorTier {
  BRONZE
  SILVER
  GOLD
  PLATINUM
}

model Ambassador {
  id                  String         @id @default(cuid())
  ambassadorId        String         @unique  // EC-A-XXXXX
  fullName            String
  phone               String
  email               String?
  universityId        String
  university          University     @relation(fields: [universityId], references: [id])
  department          String?
  level               String?
  referralCode        String         @unique  // e.g., BLESSING2026
  status              String         @default("Active")
  tier                AmbassadorTier @default(BRONZE)
  bankName            String?
  accountNumber       String?
  accountName         String?
  createdAt           DateTime       @default(now())
  updatedAt           DateTime       @updatedAt

  userId              String?        @unique
  user                User?          @relation(fields: [userId], references: [id])

  referredClients     Client[]
  projects            Project[]
}

// ─── PAYMENTS ───────────────────────────────────────────

enum PaymentType {
  CLIENT_DOWNPAYMENT
  CLIENT_BALANCE
  WORKER_PAYOUT
  AMBASSADOR_COMMISSION
  EXPENSE
  REFUND
}

enum PaymentDirection {
  INFLOW
  OUTFLOW
}

model Payment {
  id              String           @id @default(cuid())
  paymentId       String           @unique  // EC-PAY-XXXXX
  type            PaymentType
  direction       PaymentDirection
  projectId       String?
  project         Project?         @relation(fields: [projectId], references: [id])
  personName      String?          // Name of payer/payee
  personRole      String?          // client, worker, ambassador
  amount          Float
  paymentMethod   String?          // Bank Transfer, Card, Cash
  reference       String?          // Transaction reference
  confirmedById   String?
  confirmedBy     User?            @relation("ConfirmedBy", fields: [confirmedById], references: [id])
  status          String           @default("Pending")  // Pending, Confirmed, Failed, Reversed
  notes           String?
  date            DateTime         @default(now())
  createdAt       DateTime         @default(now())
}

// ─── EXPENSES ───────────────────────────────────────────

model Expense {
  id          String   @id @default(cuid())
  category    String   // Software, Internet, Marketing, Equipment, Personnel, Misc
  description String
  amount      Float
  date        DateTime
  recurring   Boolean  @default(false)
  frequency   String?  // Monthly, Quarterly, Annual, One-time
  approvedBy  String?
  createdAt   DateTime @default(now())
}

// ─── NOTIFICATIONS ──────────────────────────────────────

model Notification {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  title     String
  message   String
  type      String   // info, warning, urgent, success
  link      String?  // URL to navigate to
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
}

// ─── SETTINGS ───────────────────────────────────────────

model Setting {
  id    String @id @default(cuid())
  key   String @unique
  value String
}
```

---

## 4. COMPLETE SERVICE CATALOG (From EduCraft Flyers)

Seed this data into the Services table on initial setup.

### 4.1 Academic Writing

| Service | Code | Base Price | Variants | Form Template |
|---|---|---|---|---|
| Final Year Project (Full) | FYP-FULL | ₦70,000 | With DA: +₦20,000 | academic_fyp |
| Final Year Project (Proposal Only) | FYP-PROP | ₦20,000 | — | academic_fyp_proposal |
| Final Year Project (Chapter 4 Only) | FYP-CH4 | ₦25,000 | With DA: +₦6,500 | academic_fyp_chapter |
| Seminar Report | SEM | ₦25,000 | — | academic_seminar |
| IT Report (1-3 Months) | IT-3M | ₦15,000 | — | academic_it |
| IT Report (4-6 Months) | IT-6M | ₦20,000 | — | academic_it |
| Assignment-Based Report | ASSIGN | ₦10,000 | — | academic_assignment |
| Term Paper | TERM | ₦15,000 | — | academic_termpaper |
| Mini Project Report | MINI | ₦15,000 | — | academic_mini |
| Case Study Analysis | CASE | ₦31,500 | — | academic_casestudy |
| Thesis / Dissertation | THESIS | ₦70,000 | — | academic_fyp |

### 4.2 Final Year Combos

| Combo | Code | Base Price | Form Template |
|---|---|---|---|
| Proposal + Report (without DA) | COMBO-PR | ₦90,000 | academic_fyp_combo |
| Proposal + Report (with DA) | COMBO-PR-DA | ₦110,000 | academic_fyp_combo |
| Report (without DA) + Slides | COMBO-RS | ₦85,000 | academic_fyp_combo |
| Report (with DA) + Slides | COMBO-RS-DA | ₦100,000 | academic_fyp_combo |
| Proposal + DA Report + Slides | COMBO-PRDS | ₦120,000 | academic_fyp_combo |
| Proposal + Full Report + Slides | COMBO-PFRS | ₦100,000 | academic_fyp_combo |

### 4.3 Presentations

| Service | Code | Base Price | Form Template |
|---|---|---|---|
| PowerPoint (Design Only) | PPT-DESIGN | ₦8,000 | design_presentation |
| PowerPoint (Design + Content) | PPT-FULL | ₦10,000 | design_presentation |
| PowerPoint (FYP Slide) | PPT-FYP | ₦15,000 | design_presentation |

### 4.4 Letter Writing

| Service | Code | Base Price | Form Template |
|---|---|---|---|
| Informal Letter | LTR-INF | ₦5,000 | letter |
| Application/Cover Letter | LTR-APP | ₦5,000 | letter |
| Formal Letter | LTR-FORM | ₦8,000 | letter |
| Essay Writing (Any Kind) | ESSAY | ₦10,000 | academic_essay |

### 4.5 Editing & Proofreading

| Service | Code | Base Price | Notes | Form Template |
|---|---|---|---|---|
| Editing (Less than 50 pages) | EDIT-SM | 20% of project cost | Percentage-based | editing |
| Editing (50+ pages) | EDIT-LG | 25% of project cost | Percentage-based | editing |
| Editing + IT/Seminar Report | EDIT-IT | ₦8,000 | Fixed | editing |
| Formatting Only | FORMAT | ₦5,000 | Fixed | editing |

### 4.6 Other Services

| Service | Code | Base Price | Form Template |
|---|---|---|---|
| CV / Resume | CV | ₦10,000 | career_cv |
| Professional Profile | PROFILE | ₦8,000 | career_profile |
| Technical Diagram Design | DIAGRAM | ₦8,000 | design_diagram |
| Watermark Removal | WATERMARK | ₦3,000 | design_watermark |
| PDF Modifications | PDF-MOD | ₦5,000 | design_pdf |
| Graphic Design (Flyer) | GD-FLY | ₦8,000 | design_graphic |
| Data Analysis Only | DATA | ₦20,000 | academic_data |

### 4.7 Surcharges

| Surcharge | Amount | When Applied |
|---|---|---|
| Express Delivery (General) | +₦2,000 | Client requests rush delivery |
| Express Delivery (FYP) | +₦5,000 | Client requests rush FYP delivery |

---

## 5. UI/UX DESIGN SPECIFICATION

### 5.1 Brand Identity

EduCraft's existing brand uses a **deep teal/green** primary color with **golden yellow** as an accent. The logo features a graduation cap. The brand communicates: professional, academic, trustworthy, Nigerian.

### 5.2 Color Palette

**Dark Theme (Primary):**

| Token | Hex | Usage |
|---|---|---|
| `--bg-primary` | `#0B1120` | Main background — deep navy-charcoal |
| `--bg-secondary` | `#111827` | Card backgrounds, sidebar |
| `--bg-tertiary` | `#1A2332` | Elevated surfaces, hover states |
| `--bg-input` | `#1E293B` | Input fields, form backgrounds |
| `--border` | `#1E3A4F` | Subtle borders, dividers |
| `--border-hover` | `#2A5A6F` | Border on hover/focus |
| `--text-primary` | `#F1F5F9` | Primary text — near-white |
| `--text-secondary` | `#94A3B8` | Secondary text — muted |
| `--text-tertiary` | `#64748B` | Placeholder text, disabled |
| `--accent-primary` | `#0D9488` | Primary brand — teal (EduCraft green) |
| `--accent-primary-hover` | `#0F766E` | Teal hover state |
| `--accent-secondary` | `#F59E0B` | Golden yellow (EduCraft accent) |
| `--accent-secondary-hover` | `#D97706` | Yellow hover state |
| `--success` | `#10B981` | Success states, completed |
| `--warning` | `#F59E0B` | Warning states, approaching deadline |
| `--danger` | `#EF4444` | Error states, overdue, critical |
| `--info` | `#3B82F6` | Informational, awaiting |

**Light Theme:**

| Token | Hex | Usage |
|---|---|---|
| `--bg-primary` | `#FFFFFF` | Main background |
| `--bg-secondary` | `#F8FAFC` | Card backgrounds |
| `--bg-tertiary` | `#F1F5F9` | Elevated surfaces |
| `--bg-input` | `#FFFFFF` | Input fields (with border) |
| `--border` | `#E2E8F0` | Borders |
| `--text-primary` | `#0F172A` | Primary text |
| `--text-secondary` | `#475569` | Secondary text |
| `--accent-primary` | `#0D9488` | Same teal |
| `--accent-secondary` | `#D97706` | Slightly deeper yellow for contrast |

### 5.3 Typography

| Role | Font | Weight | Size |
|---|---|---|---|
| Display / Headings | Inter | 700 (Bold) | 24-32px |
| Body | Inter | 400 (Regular) | 14-16px |
| Captions / Labels | Inter | 500 (Medium) | 12-13px |
| Data / Numbers | JetBrains Mono | 500 | 14-16px |
| Brand / Logo | Poppins | 700 | — |

Use `JetBrains Mono` for financial figures, project IDs, and any numerical data. This makes numbers scannable and gives the dashboard a professional data-driven feel.

### 5.4 Layout Principles

**Desktop (1024px+):**
- Collapsible sidebar (240px expanded, 64px collapsed) on the left
- Main content area with max-width 1400px
- Top bar with search, notifications, user menu
- Cards use consistent 24px padding, 12px border-radius, subtle border

**Tablet (768px–1023px):**
- Sidebar collapses to icon-only by default
- Content fills available width
- Tables become scrollable horizontally

**Mobile (< 768px) — THIS IS CRITICAL (85% of users):**
- No sidebar. Use bottom navigation bar (5 icons max)
- Top bar simplified: logo + notifications + user avatar
- Cards stack vertically, full-width
- Tables transform to card-based lists on mobile
- Forms are full-width, large touch targets (min 44px height)
- Bottom nav for each role:
  - Admin: Dashboard | Projects | QA | Finance | More
  - Worker: Dashboard | Projects | Earnings | Profile
  - Ambassador: Dashboard | Referrals | Commissions | Profile

### 5.5 Component Patterns

**Stats Cards:**
```
┌─────────────────────────┐
│  ₦3.45M                 │  ← JetBrains Mono, large, --text-primary
│  Revenue This Month     │  ← Inter, small, --text-secondary
│  ↑ 18% vs last month    │  ← Inter, small, --success (green)
└─────────────────────────┘
Background: --bg-secondary
Border: 1px solid --border
Border-radius: 12px
```

**Status Badges:**
```
● NEW              → gray
● DOWNPAY VERIFIED → blue
● CONFIRMED        → blue
● ASSIGNED         → purple
● IN PROGRESS      → teal (accent-primary)
● AWAITING INPUT   → yellow (accent-secondary)
● SUBMITTED        → indigo
● IN QA            → orange
● APPROVED         → green
● BALANCE VERIFIED → green
● DELIVERED        → green
● COMPLETED        → green (filled)
● OVERDUE          → red (pulsing dot)
● CANCELLED        → gray (strikethrough)
```

**Pipeline Bar (Desktop):**
```
┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐
│ NEW  │ PAID │ CONF │ ASGN │ PROG │ SUBM │  QA  │ DELV │
│  5   │  8   │  3   │  2   │  15  │  4   │  6   │  1   │
└──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘
```

**Pipeline (Mobile) — Horizontal scroll or two-row grid:**
```
┌────┬────┬────┬────┐
│NEW │PAID│CONF│ASGN│
│ 5  │ 8  │ 3  │ 2  │
├────┼────┼────┼────┤
│PROG│SUBM│ QA │DELV│
│ 15 │ 4  │ 6  │ 1  │
└────┴────┴────┴────┘
```

**Data Table → Mobile Card Transformation:**

Desktop: Full table row
```
EC-00234 | John Okafor | FYP Full | In Progress | Chidi O. | Aug 16 | ₦70,000
```

Mobile: Card
```
┌─────────────────────────────────┐
│ EC-00234          ● In Progress │
│ John Okafor — FYP Full          │
│ Worker: Chidi O.                │
│ Deadline: Aug 16    ₦70,000     │
└─────────────────────────────────┘
```

### 5.6 Form Design (Intake Forms)

**Multi-step with progress indicator:**
```
  ①───────②───────③───────④───────⑤
  You    Project  Files   Prelim  Review
  ✓       ●        ○       ○       ○
```

- Steps use a top progress bar showing current position
- Each step is a full-screen view on mobile
- "Next" and "Back" buttons are fixed at the bottom on mobile (sticky)
- Form fields are large (min 48px height for inputs)
- Dropdown selects use native mobile select on phones
- File upload uses drag-and-drop on desktop, tap-to-select on mobile
- Validation happens per-step (can't advance with errors)
- Data is preserved when navigating back

**Service selection page (before the form):**

The client first lands on a service selection page showing all available services organized by category with prices. They tap/click a service → routed to the correct multi-step form for that service type.

```
WHAT DO YOU NEED?
─────────────────

📝 Academic Writing
  ┌─────────────────────────────────┐
  │ Final Year Project      ₦70,000 │  →
  │ Full 5-chapter project report   │
  ├─────────────────────────────────┤
  │ Seminar Report          ₦25,000 │  →
  ├─────────────────────────────────┤
  │ IT Report (1-3 Months)  ₦15,000 │  →
  ├─────────────────────────────────┤
  │ Term Paper              ₦15,000 │  →
  └─────────────────────────────────┘

🎨 Presentations & Design
  ┌─────────────────────────────────┐
  │ PowerPoint Slides        ₦8,000 │  →
  │ Design only, you provide content│
  ├─────────────────────────────────┤
  │ CV / Resume             ₦10,000 │  →
  └─────────────────────────────────┘

📦 Combos (Save More)
  ┌─────────────────────────────────┐
  │ Proposal + Report       ₦90,000 │  →
  │ Report + Slides         ₦85,000 │  →
  └─────────────────────────────────┘
```

### 5.7 Public Pages

**Landing Page (`/`):**
- Hero: "Academic excellence, professionally delivered" or similar
- Service categories overview (cards linking to `/services`)
- How it works (3 steps: Submit details → We work → You receive)
- Trust signals (projects completed counter, universities covered, client satisfaction)
- CTA: "Start Your Project" → goes to `/intake`
- Footer: contact info, social links

**Services Page (`/services`):**
- Full service catalog with pricing
- Category filters
- Each service card has "Order Now" button → `/intake/[serviceCode]`

**Project Tracker (`/track/[projectId]`):**
- Public page (no login required)
- Shows project status pipeline with current position highlighted
- No sensitive details — just status, estimated completion, and whether any action is needed from client

---

## 6. CONDITIONAL INTAKE FORM FLOWS

The intake system uses a **form engine** that loads different field configurations based on the service type. The engine supports these field types:

- text, textarea, email, phone, number
- select (dropdown), radio, checkbox
- date, file (single/multiple)
- dynamic_list (add/remove items — for siblings, friends in dedication)
- conditional (show/hide based on another field's value)

### 6.1 Form Template: `academic_fyp`

**Used by:** FYP-FULL, THESIS

| Step | Title | Fields |
|---|---|---|
| 1 | About You | fullName*, projectPartners, university* (dropdown), faculty*, department*, matricNumber*, phone*, email, referralCode |
| 2 | Your Project | projectTitle*, supervisorName*, otherSupervisors, hodName*, projectType* (radio), chapterCount* (default 5), referencingStyle* (dropdown), dataRequirements* (radio), minimumPages* (radio) |
| 3 | Requirements & Files | hasDepartmentOutline (radio) → if yes: upload or type, proposalDocuments (file upload), specialInstructions (textarea), clientDeadline (date, min 7 days from today), isExpressDelivery (checkbox with +₦5,000 note) |
| 4 | Preliminary Pages | dedicationType* (radio with 4 options), dedicationDetails (dynamic based on selection — add names), acknowledgmentPeople (checklist + details) |
| 5 | Review & Submit | Summary of all fields, price calculation, payment instructions, T&C checkbox, submit button |

### 6.2 Form Template: `academic_seminar`

**Used by:** SEM

| Step | Title | Fields |
|---|---|---|
| 1 | About You | fullName*, university*, faculty*, department*, matricNumber*, phone*, email, referralCode |
| 2 | Seminar Details | projectTitle*, supervisorName*, referencingStyle*, specialInstructions, clientDeadline, isExpressDelivery |
| 3 | Files | proposalDocuments (file), departmentOutline (file/text) |
| 4 | Review & Submit | Summary, price, payment instructions |

### 6.3 Form Template: `academic_termpaper`

**Used by:** TERM, ASSIGN, MINI, ESSAY

| Step | Title | Fields |
|---|---|---|
| 1 | About You | fullName*, university*, department*, phone*, email, referralCode |
| 2 | Details | courseTitle, courseCode, projectTitle* (topic), wordCount, referencingStyle*, clientDeadline, specialInstructions |
| 3 | Files | Upload any instructions from lecturer (file) |
| 4 | Review & Submit | Summary, price, payment instructions |

### 6.4 Form Template: `academic_it`

**Used by:** IT-3M, IT-6M

| Step | Title | Fields |
|---|---|---|
| 1 | About You | fullName*, university*, faculty*, department*, matricNumber*, phone*, email, referralCode |
| 2 | IT Details | companyName* (where IT was done), companyAddress, itDuration* (dropdown: 1-3 months, 4-6 months), departmentAtCompany, supervisorAtCompany, projectTitle*, specialInstructions |
| 3 | Files | IT letter, log book template (file uploads) |
| 4 | Review & Submit | Summary, price, payment instructions |

### 6.5 Form Template: `career_cv`

**Used by:** CV, PROFILE

| Step | Title | Fields |
|---|---|---|
| 1 | Contact Info | fullName*, phone*, email*, linkedinUrl, address |
| 2 | Education | entries (dynamic list): degree, university, graduationYear, cgpa |
| 3 | Experience | entries (dynamic list): jobTitle, company, startDate, endDate, description |
| 4 | Skills & More | skills (multi-tag input), certifications (dynamic list), interests, careerObjective |
| 5 | Style Preference | stylePreference (radio with preview images: Modern, Classic, Creative, Minimal) |
| 6 | Review & Submit | Summary, price, payment instructions |

### 6.6 Form Template: `design_presentation`

**Used by:** PPT-DESIGN, PPT-FULL, PPT-FYP

| Step | Title | Fields |
|---|---|---|
| 1 | About You | fullName*, phone*, email, referralCode |
| 2 | Presentation Details | topic*, purpose (dropdown: Academic Defense, Class Presentation, Business, Other), audience, numberOfSlides, contentSource (radio: I'll provide content / Create content for me / I have a report to summarize) |
| 3 | Design Preferences | colorScheme (palette selector), style (radio: Formal, Modern, Creative, Minimal), specialInstructions |
| 4 | Files | Upload content, report, or reference slides (file) |
| 5 | Review & Submit | Summary, price, payment instructions |

### 6.7 Form Template: `editing`

**Used by:** EDIT-SM, EDIT-LG, EDIT-IT, FORMAT

| Step | Title | Fields |
|---|---|---|
| 1 | About You | fullName*, phone*, email, referralCode |
| 2 | What Needs Editing | editingType (radio: Full Editing, Formatting Only, Proofreading Only), documentPageCount*, referencingStyle, specialInstructions |
| 3 | Upload Document | documentFile* (the file to edit), referenceGuide (optional — department format guide) |
| 4 | Review & Submit | Summary, price (calculated from page count), payment instructions |

---

## 7. AMBASSADOR SYSTEM (Migrated & Expanded)

The current Ambassador Panel features are rebuilt inside WorkBase with these sections:

### 7.1 Admin → Ambassadors Section

**Ambassadors List:** Table with all ambassadors, their school, tier, referrals, conversions, commission balance, and status. Replaces the current "Ambassador Slots" view.

**School Coverage:** Card-based view showing each university with ambassador count, fill status, and performance. Replaces current "Schools" page. Enhanced with: revenue per school, active projects, conversion rate.

**Applications:** Ambassador application review queue. When someone applies via the public form (`/apply`), their application appears here for admin approval.

**Ambassador Detail:** Full profile with referral history, conversion timeline, commission payouts, tier progression, and performance stats.

### 7.2 Ambassador Portal

**Dashboard:** Welcome + key stats (total referrals, conversions, balance, tier + progress to next)

**My Referral Link:** Large, prominent copy-to-clipboard section with their unique link and code. Share buttons for WhatsApp, Instagram, etc.

**Referrals:** List of people who used their code — shows name, date, whether they converted to a paying client.

**Commissions:** Earnings breakdown — per project, total earned, total paid, balance. Payout history.

**Leaderboard:** Top ambassadors ranked by conversions or revenue. Optional — can be gamified with monthly prizes.

**Profile:** Personal info, bank details (editable), university info.

---

## 8. PAGE-BY-PAGE EXTERNAL ARCHITECTURE

### Public Pages (No Auth Required)

| Page | URL | Purpose |
|---|---|---|
| Landing Page | `/` | Marketing, trust signals, CTAs |
| Services & Pricing | `/services` | Full catalog with "Order Now" buttons |
| Intake Form | `/intake` | Service selection → form flow |
| Intake Form (Specific) | `/intake/[serviceCode]` | Multi-step form for that service |
| Chapter 3/4 Form | `/intake/ch34/[projectId]` | Mid-project data collection |
| Project Tracker | `/track/[projectId]` | Public status check |
| Ambassador Application | `/apply` | Public application form |
| Submission Success | `/intake/success` | Confirmation with project ID |
| Login | `/login` | Auth for all roles |

### Internal Pages (Auth Required — By Role)

| Page | URL | Role | Purpose |
|---|---|---|---|
| Admin Dashboard | `/admin` | Admin | Command center |
| Projects List | `/admin/projects` | Admin | All projects with filters |
| Project Detail | `/admin/projects/[id]` | Admin | Full project view |
| New Project (Manual) | `/admin/projects/new` | Admin | Manual project entry |
| Client List | `/admin/clients` | Admin | All clients |
| Client Detail | `/admin/clients/[id]` | Admin | Client profile + history |
| Workers List | `/admin/workers` | Admin | All workers with stats |
| Worker Detail | `/admin/workers/[id]` | Admin | Worker profile |
| Ambassadors List | `/admin/ambassadors` | Admin | All ambassadors |
| Ambassador Detail | `/admin/ambassadors/[id]` | Admin | Ambassador profile |
| School Coverage | `/admin/ambassadors/schools` | Admin | University map |
| QA Queue | `/admin/qa` | Admin | Review queue |
| QA Review | `/admin/qa/[id]` | Admin | Checklist review |
| Financial Dashboard | `/admin/finance` | Admin | Revenue, P&L, metrics |
| Payout Queue | `/admin/finance/payouts` | Admin | Worker + ambassador payouts |
| Expenses | `/admin/finance/expenses` | Admin | Track operating costs |
| Reports | `/admin/reports` | Admin | Weekly/monthly reports |
| Settings | `/admin/settings` | Admin | Services, pricing, team |
| Worker Dashboard | `/worker` | Worker | My assignments |
| Worker Project | `/worker/projects/[id]` | Worker | Assignment detail |
| Worker Earnings | `/worker/earnings` | Worker | My earnings |
| Worker Profile | `/worker/profile` | Worker | My stats |
| Ambassador Dashboard | `/ambassador` | Ambass. | My stats + link |
| Ambassador Referrals | `/ambassador/referrals` | Ambass. | My referrals |
| Ambassador Commissions | `/ambassador/commissions` | Ambass. | My earnings |
| Ambassador Leaderboard | `/ambassador/leaderboard` | Ambass. | Rankings |
| Ambassador Profile | `/ambassador/profile` | Ambass. | My info + bank |

---

## 9. INITIAL CLAUDE CODE PROMPT

Use this prompt to initialize the project with Claude Code:

```
I'm building EduCraft WorkBase — a full-stack operations platform for an academic services company in Nigeria. This is a NEW project, not built on top of anything existing.

TECH STACK:
- Next.js 14+ (App Router) with TypeScript
- PostgreSQL with Prisma ORM
- NextAuth.js for authentication (email/password, role-based)
- Tailwind CSS with shadcn/ui components
- Recharts for dashboard charts
- React Hook Form + Zod for form validation

PROJECT SETUP:
1. Initialize a new Next.js project with TypeScript and Tailwind
2. Install and configure: prisma, @prisma/client, next-auth, @auth/prisma-adapter, shadcn/ui, recharts, react-hook-form, @hookform/resolvers, zod, lucide-react
3. Set up the project structure as defined in the spec document
4. Configure Tailwind for dark mode (class-based) with the custom color tokens
5. Set up Prisma with PostgreSQL connection

The app has 4 user roles: SUPER_ADMIN, WORKER, AMBASSADOR, CLIENT
Dark theme is the default. Light mode toggle available.
85% of users are on mobile — mobile-first responsive design is critical.

Start by:
1. Setting up the project with all dependencies
2. Creating the complete Prisma schema (I'll provide it)
3. Setting up authentication with role-based routing
4. Creating the dashboard layout with sidebar (desktop) and bottom nav (mobile)
5. Building the admin command center dashboard

Brand colors:
- Primary: teal #0D9488
- Accent: golden yellow #F59E0B
- Dark BG: #0B1120
- Card BG: #111827

Refer to the full blueprint document for detailed specs on every page, form, and feature.
```

---

## 10. BUILD PHASES (For Claude Code Sessions)

### Phase 1: Foundation (Sessions 1-3)
**Prompt focus:** Project setup, database schema, auth, layout shell, theme system

### Phase 2: Admin Core (Sessions 4-8)
**Prompt focus:** Command center dashboard, projects CRUD, pipeline view, project detail with tabs

### Phase 3: Intake System (Sessions 9-13)
**Prompt focus:** Service selection page, multi-step form engine, FYP form, referral tracking, form submission → project creation

### Phase 4: People & Assignment (Sessions 14-17)
**Prompt focus:** Workers list/profiles, ambassador list/profiles, worker recommendation engine, assignment workflow

### Phase 5: QA & Payments (Sessions 18-21)
**Prompt focus:** QA queue, checklist system, payment verification (downpayment + balance), payout queue

### Phase 6: Financial Dashboard (Sessions 22-25)
**Prompt focus:** Revenue cards, charts, cash flow breakdown, business intelligence metrics, trend alerts

### Phase 7: Portals (Sessions 26-29)
**Prompt focus:** Worker portal (assignments, earnings), ambassador portal (referrals, commissions, leaderboard)

### Phase 8: Polish & Deploy (Sessions 30-33)
**Prompt focus:** Mobile optimization, notifications, data export, testing, deployment to Vercel + Railway

---

*This spec is designed to be fed to Claude Code section by section. Each phase should reference this document for context. Keep this file accessible throughout the entire build process.*
