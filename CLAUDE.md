# CLAUDE.md — EduCraft HQ

## Project Overview

EduCraft HQ is a full-stack operations platform for EduCraft, a Nigerian academic services company. It manages the entire business: client intake, project tracking, worker assignment, quality assurance, ambassador management, financial reporting, and delivery.

EduCraft provides academic writing (final year projects, seminar reports, term papers, IT reports), presentations, CV/resume design, editing, and publication services to university students across Nigeria. The platform is scaling from ~100 projects/year toward 15,000 projects/year (₦1 billion revenue target).

**Founder:** Prince Amadin (amadinprince26@gmail.com)
**Contact:** 07063421088 | educraft611@gmail.com
**Brand tagline:** "EduCraft — Providing Affordable Academic Services"

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14+ (App Router) with TypeScript |
| Database | PostgreSQL on Supabase |
| ORM | Prisma (uses `url` for runtime, `directUrl` for migrations) |
| Auth | NextAuth.js (Auth.js) — email/password, role-based |
| Styling | Tailwind CSS with class-based dark mode |
| UI Components | shadcn/ui |
| Charts | Recharts |
| Forms | React Hook Form + Zod validation |
| Icons | react-icons (Lucide family — `react-icons/lu`) |
| Animations | Framer Motion |
| File Storage | AWS S3 or Cloudinary (when implemented) |
| Hosting | Vercel (frontend + API) + Supabase (database) |

## Key Commands

```bash
# Development
npm run dev                    # Start dev server (localhost:3000)

# Database (ALWAYS use these, not bare prisma commands)
npm run db:migrate             # Run migrations (uses .env.local via dotenv-cli)
npm run db:seed                # Seed database
npm run db:studio              # Open Prisma Studio
npm run db:generate            # Regenerate Prisma client

# Build
npm run build                  # Production build
npm run lint                   # Lint check
```

**CRITICAL:** Never run `npx prisma migrate dev` directly. Always use `npm run db:migrate`. Prisma CLI reads `.env`, not `.env.local`. The npm scripts use `dotenv-cli` to load `.env.local` correctly.

## User Roles

| Role | Access | Route Prefix |
|---|---|---|
| SUPER_ADMIN | Everything | `/admin` |
| OPS_MANAGER | Same as admin except: no delete, no pricing changes, no founder financials | `/admin` |
| WORKER | Own assignments, earnings, stats only | `/worker` |
| AMBASSADOR | Own referrals, commissions, leaderboard only | `/ambassador` |
| CLIENT | (Future) Own projects, status, downloads | `/client` |

## Brand Design System

### Colors

**Dark theme (default):**
- Background primary: `#0B1120`
- Background secondary (cards): `#111827`
- Background tertiary (elevated): `#1A2332`
- Border: `#1E3A4F`
- Text primary: `#F1F5F9`
- Text secondary: `#94A3B8`
- Accent primary (teal): `#0D9488`
- Accent secondary (gold): `#F59E0B`
- Success: `#10B981`
- Warning: `#F59E0B`
- Danger: `#EF4444`

**Light theme:**
- Background primary: `#FFFFFF`
- Background secondary: `#F8FAFC`
- Text primary: `#0F172A`
- Text secondary: `#475569`
- Accent primary: `#0D9488` (same teal)

### Typography
- Headings: Inter, 700 weight
- Body: Inter, 400 weight
- Data/Numbers: JetBrains Mono, 500 weight
- Brand: Poppins, 700 weight

### Critical UI Rules
- 85% of users are on mobile — mobile-first is mandatory
- All icons from `react-icons/lu` (Lucide family) — ZERO emojis anywhere
- All animations via Framer Motion — purposeful, fast (150–500ms), spring physics
- Dark theme is default, light mode toggle available
- Desktop: collapsible sidebar (240px/64px)
- Mobile: bottom navigation bar (5 icons max), no sidebar
- Tables transform to card layouts on mobile
- Form inputs minimum 48px height for touch targets
- Both themes must look equally polished

### Logo Files
- Dark backgrounds: `public/images/logo/transparent_light_logo.png`
- Light backgrounds: `public/images/logo/transparent_dark_logo.png`
- Theme toggle should swap the logo automatically

## Project Structure

```
src/
├── app/
│   ├── (public)/          # No auth: landing, services, intake, track, apply
│   ├── (auth)/            # Login page
│   ├── (dashboard)/       # Authenticated: admin/, worker/, ambassador/
│   └── api/               # API routes
├── components/
│   ├── ui/                # shadcn/ui components
│   ├── layout/            # Sidebar, Topbar, MobileNav, ThemeToggle
│   ├── dashboard/         # StatsCard, PipelineBar, ActivityFeed, RevenueChart
│   ├── projects/          # ProjectsTable, ProjectDetail, StatusBadge
│   ├── forms/             # IntakeFormEngine, FormStep, ServiceSelector
│   ├── finance/           # RevenueCards, PayoutQueue, CashFlowBreakdown
│   ├── qa/                # QAQueue, QAChecklist
│   └── shared/            # DataTable, SearchInput, EmptyState, LoadingState
├── lib/
│   ├── db.ts              # Prisma client
│   ├── auth.ts            # NextAuth config
│   ├── utils.ts           # Utilities
│   ├── constants.ts       # App constants
│   ├── validations/       # Zod schemas
│   └── services/          # Business logic (projects, payments, assignments)
├── hooks/                 # Custom React hooks
└── types/                 # TypeScript types
```

## Database

PostgreSQL on Supabase. Prisma schema has 14 core models:

**Core:** User, University, Client, Service, ServiceVariant, Project, ProjectFile, ProjectStatusLog, Worker, Ambassador, Payment, Expense, Notification, Setting

**Key relationships:**
- Client → many Projects
- Project → one Worker, one Ambassador, one Service, many Files, many StatusLogs, many Payments
- Ambassador → many Clients (referrals), many Projects
- Worker → many Projects

**ID formats:**
- Client: `EC-C-XXXXX`
- Project: `EC-XXXXX`
- Worker: `EC-W-XXXXX`
- Ambassador: `EC-A-XXXXX`
- Payment: `EC-PAY-XXXXX`

## The Project Pipeline

Every project follows this lifecycle:

```
NEW → DOWNPAYMENT_VERIFIED → REQUIREMENTS_CONFIRMED → ASSIGNED
→ IN_PROGRESS → [AWAITING_CLIENT_INPUT] → SUBMITTED
→ IN_QA_REVIEW → [REVISION_NEEDED] → APPROVED
→ BALANCE_VERIFIED → DELIVERED → [SUPERVISOR_CORRECTIONS] → COMPLETED
```

Special statuses: ON_HOLD, CANCELLED, REFUNDED, DISPUTED

**Pipeline rules (enforce strictly):**
1. No advancement past NEW without verified downpayment
2. No assignment without confirmed requirements
3. Worker must accept before IN_PROGRESS
4. No delivery without QA pass (qaStatus = "Passed")
5. No delivery without verified balance payment
6. Deadline alerts: 5 days (gentle), 3 days (urgent), 1 day (critical), passed (OVERDUE)
7. Revision cap: 3 revisions → flag for founder review
8. AWAITING_CLIENT_INPUT pauses the deadline clock

## Payment Model

EduCraft uses a 45%/55% split payment:
- Client pays 45% downpayment upfront (work begins)
- Client pays 55% balance after QA approval (delivery unlocked)

**Revenue split per project:**
- Worker: 40% of total price
- Ambassador: 10–15% (based on tier)
- EduCraft: remaining 45–50%

Commission is paid to ambassadors immediately when the client pays the downpayment (not on project completion).

## Intake Forms

Different services use different multi-step form templates. The `intakeFormTemplate` field on the Service model determines which form loads.

| Template | Used By | Steps |
|---|---|---|
| academic_fyp | FYP Full, Thesis | Personal → Project → Requirements → Preliminary Pages → Review |
| academic_seminar | Seminar Report | Personal → Details → Files → Review |
| academic_termpaper | Term Paper, Assignment, Mini Project | Personal → Details → Files → Review |
| academic_it | IT Report | Personal → IT Details → Files → Review |
| career_cv | CV, Resume | Contact → Education → Experience → Skills → Style → Review |
| design_presentation | PowerPoint | Personal → Details → Preferences → Files → Review |
| editing | Editing, Formatting | Personal → Details → Upload Document → Review |

Each form step validates independently. Data is preserved on back-navigation. Mobile-first with large touch targets and native selects.

## Formatting Standards (Applied to Generated Documents)

When creating or checking .docx files:
- Font: Times New Roman 12pt (body AND headings)
- Line spacing: 2.0 throughout (strict — no extra spacing above/below headings)
- Margins: 1.0 inch all sides
- Alignment: Justified body, Centred H1 (UPPER CASE), Left H2 (Title Case), Left H3 (Sentence case)
- No paragraph indentation
- No hyphens as sentence separators (use commas)
- All *et al.* italicised
- Page numbering: Roman numerals (prelims), Arabic from Chapter One, centre-aligned
- Equations: own line, borderless two-column table, numbered as Chapter.Number (no parentheses)
- Tables: must not break across pages, three-line format for engineering
- TOC: no dotted leaders, includes H1–H3
- Figures/Tables: captions present, all in List of Figures/Tables, cited with sources

## Ambassador System

**Tiers:** Bronze (10%), Silver (12%, 6+ conversions), Gold (15%, 16+ conversions), Platinum (15% + quarterly bonus, 31+)

**Parent-child chain:** Ambassadors can recruit sub-ambassadors. Parent gets 5% from sub's referrals. Max 1 level deep, max 5 subs, requires Silver tier to activate.

**Recruitment:** Waitlist group → Registration every 2 weeks → Auto-generated kit with personalised referral link → 30-Day Activation Challenge → Ambassador Hub community

## Spec Documents (in project root)

These contain the detailed specifications for every system. Reference them when building:

| Document | Content |
|---|---|
| `EDUCRAFT_WORKBASE_BLUEPRINT_v2.md` | Data model, pipeline, screens, forms, financial dashboard |
| `EDUCRAFT_CLAUDE_CODE_SPEC.md` | Tech stack, project structure, Prisma schema, API endpoints, UI spec |
| `EDUCRAFT_QUALITY_STANDARD_v1.md` | Master quality system — 4 layers, pipeline, roles, metrics |
| `EDUCRAFT_VOICE_v1.1.md` | Writing quality rules, banned phrases, chapter voice standards |
| `EDUCRAFT_STRUCTURAL_QUALITY_v1.1.md` | Document structure templates, department overrides, page counts |
| `EDUCRAFT_REFERENCE_VERIFICATION_SYSTEM_v1.md` | Citation verification — 3 tiers, AI prompts, thresholds |
| `EDUCRAFT_FORMATTING_QUALITY_SCRIPT_v1.md` | 71 formatting rules, Python script spec, profiles |
| `EDUCRAFT_REPORT_PRODUCTION_SYSTEM_v1.md` | Parallel agent architecture, quality gates, token monitoring |
| `EDUCRAFT_CLIENT_ACQUISITION_SYSTEM_v1.md` | Ambassador engine, partnerships, content strategy, LTV |
| `EDUCRAFT_20_DAY_BUILD_ROADMAP.md` | Day-by-day build plan with Claude Code prompts |

## Common Patterns

### API Route Pattern
```typescript
// src/app/api/projects/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // ... query db, return data
}
```

### Component Pattern
```typescript
// Use shadcn/ui components, Tailwind classes, Lucide icons
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LuFileText } from "react-icons/lu";

export function StatsCard({ title, value, icon }: Props) {
  return (
    <Card className="bg-card border-border">
      <CardHeader>...</CardHeader>
      <CardContent>...</CardContent>
    </Card>
  );
}
```

### Form Pattern
```typescript
// Use React Hook Form + Zod
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({ ... });
const form = useForm({ resolver: zodResolver(schema) });
```

## Things to NEVER Do

1. **Never use emojis as icons** — always use react-icons/lu (Lucide)
2. **Never use localStorage/sessionStorage in artifacts** — use React state or server-side storage
3. **Never hardcode mock data** — always pull from the database, show zeros if empty
4. **Never expose internal automation to clients** — all AI/automation is internal only
5. **Never run bare `prisma` commands** — always use the npm scripts with dotenv-cli
6. **Never put secrets in code** — all secrets in .env.local (local) or Vercel env vars (production)
7. **Never skip mobile testing** — 85% of users are on phones
8. **Never use dotted tab leaders** in TOC, List of Figures, List of Tables, or List of Appendices
9. **Never use parentheses in equation numbering** — format is `3.1` not `(3.1)` (exception: publications)
10. **Never allow tables to break across pages** unless genuinely too long for one page

## Current Build Status

Update this section as you build:

- [x] Project scaffolded, dependencies installed
- [x] Prisma schema created and migrated
- [x] Auth working (login → /admin)
- [x] Database seeded (admin user, services, universities)
- [x] Landing page (editorial design, dark theme)
- [x] Admin Command Center dashboard
- [x] Projects list + detail
- [x] Manual project creation
- [x] Client management
- [ ] Worker management + assignment
- [ ] Ambassador management
- [ ] Payout system
- [ ] Intake forms (multi-step, conditional)
- [ ] Referral tracking
- [x] Pipeline status transitions (state machine + guards; QA screen still pending)
- [x] Payment verification (downpayment/balance verify; ambassador commission record deferred to Day 5)
- [ ] Notifications
- [ ] QA review system
- [ ] Worker portal
- [ ] Ambassador portal
- [ ] Ambassador application (/apply)
- [ ] Services page (/services)
- [ ] Project tracker (/track)
- [ ] Financial dashboard
- [ ] Expenses tracking
- [ ] Reports
- [ ] Settings + service management
- [ ] Mobile optimization pass
- [ ] Light theme pass
- [ ] Production deployment
