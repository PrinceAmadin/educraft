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
npm run catalogue:sync         # Dry-run: service prices vs prisma/catalogue.ts (add -- --apply to write)

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

Source of truth: `DATA/EDUCRAFT_UI_CONSTITUTION.md`. Tokens live in `src/app/globals.css`.

**Light theme (default):**
- Page: `#F8F9FA` (`bg-background`)
- Surface: `#FFFFFF` (`bg-card` + `shadow-soft`)
- Zone band: `#F1F3F5` (`bg-zone`)
- Input fill: `#F5F6F4` (`bg-input`, edge `border-input-border`)
- Text primary: `#0F172A` · secondary: `#475569` · tertiary: `#64748B`
- Accent teal: `#0D9488` (hover `#0F766E`)
- Border (last resort only): `#E8EAED`
- Soft shadow: `0 12px 40px rgba(15, 23, 42, 0.06)`

**Dark theme (secondary — multi-surface depth, not navy + borders):**
- Page: `#0B1120` · Surface: `#131B2E` · Elevated: `#1A2540`
- Text primary: `#F1F5F9` · Border: `#1E3048` (barely visible, sparingly)
- Accent teal: `#0D9488` family · Gold: `#F59E0B`

Status hues (gold, success, danger) are set deeper than their fill swatches in the light theme so they stay legible as text.

### Typography
- Headings: Inter, 700 weight
- Body: Inter, 400 weight
- Data/Numbers: JetBrains Mono, 500 weight
- Brand: Poppins, 700 weight

### Critical UI Rules
- 85% of users are on mobile — mobile-first is mandatory
- All icons from `react-icons/lu` (Lucide family) — ZERO emojis anywhere
- All animations via Framer Motion — purposeful, fast (150–500ms), spring physics
- Light theme is default, dark mode toggle available
- **No boxes inside boxes.** Separate with spacing and type first, then a zone (`bg-zone` / `Surface tone="zone"`), then a soft shadow (`surface` / `Card`). A border is the last resort. Never wrap a form, a table or a stat row in a bordered card
- Stats sit on the page (`StatsCard` + `STATS_GRID`); the pipeline is one rail; tables have faint row dividers and no outer container
- Forms: no outer container — `FormSection` headings organise them; `FormActions` for the submit row; `Textarea` / `Input` / `Select` share `fieldClasses`; universities use `UniversityCombobox`
- Page titles use `PageHeader`. Sentence case everywhere; uppercase only on tiny metadata (`.eyebrow`). Monospace only for data, money and IDs — labels use `.meta-label`
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
11. **Never commit `Educraft_Ambassador/`** — the old standalone app, kept for reference at `~/Downloads/Educraft_Ambassador_reference/` outside this repo. It has a hardcoded fallback admin password; it was committed once by mistake and its history had to be scrubbed with `git filter-repo` (Sept 2026). `.gitignore` covers it — don't remove that entry.

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
- [x] Worker management + assignment
- [x] Ambassador management
- [x] Payout system (worker + ambassador; CSV export still pending)
- [x] Intake forms (multi-step, conditional) — /intake selection + 7 templates (fyp, termpaper, seminar, it, cv, presentation, editing); `letter` still falls back to WhatsApp
- [x] Referral tracking (code generation, referral link, referred-client history, URL ?ref= prefill, commission linking)
- [x] Pipeline status transitions (state machine + guards; QA screen still pending)
- [x] Payment verification (mark-paid + verify modal with method/reference/date/notes; list quick action; ADMIN_HOLDS control on detail page)
- [x] Notifications (in-app: topbar bell + feed, mark read/all; triggers for intake, payments, assignment, QA, revision cap, referral, payouts)
- [x] QA review system (queue + checklist per template + pass/revision/escalate)
- [x] Worker portal (dashboard, assignment detail with accept/submit, earnings, profile; strictly own-data scoped)
- [x] Ambassador portal (dashboard w/ referral link + QR, referrals, commissions, leaderboard, profile; own-data scoped)
- [x] Ambassador application (/apply + admin review/approve/reject)
- [x] Services page (/services)
- [x] Project tracker (/track — public, no sensitive data)
- [x] Financial dashboard (/admin/finance — revenue cards, trend chart, cash flow breakdown, outstanding balances, business intelligence)
- [x] Expenses tracking (/admin/finance/expenses — add/filter/delete, month total, projected recurring)
- [x] Reports (/admin/reports — monthly report, month picker, CSV/PDF export; Super Admin only)
- [x] Settings + service management (general settings, service catalogue, team — pricing/team gated to Super Admin)
- [x] Mobile optimization pass (audited every page against 375–1440px; fixed cramped stat grids, a QA checklist touch target, and referral-link input heights)
- [x] Light theme pass (token audit — no hardcoded colors outside intentional always-dark surfaces) + bug fix sweep (workers/ambassadors can now be given a portal login — previously impossible)
- [x] Data migration script (`npm run migrate:legacy` — imports ambassadors/clients/projects from DATA/migration/*.csv, idempotent) + full end-to-end role testing (admin/worker/ambassador/public, all clean)
- [x] Phase A UI overhaul (UI Constitution): light default, surfaces/zones instead of bordered cards, PageHeader/FormSection/FormActions/Textarea/UniversityCombobox, Command Center zones + one-rail pipeline, finance "big number first", /services search + category pills + grouped rows + /services/[code] detail, split sign-in, borderless scroll controls, CV carousel; checked at 375/414/768/1024/1440 in light and dark
- [x] Ambassador system unified — `/apply` is the one application flow (gained payment details + duplicate detection from the old standalone app), backed by the existing Prisma `Ambassador`/`AmbassadorApplication` tables and real tier ladder (`src/lib/ambassador.ts`). The old Redis-backed admin panel was retired; its real applicants were migrated in with `npm run migrate:ambassador-panel` (idempotent — rerun after collecting phone numbers for the skipped rows it reports). `/EduCraftA`, `/ECCA`, `/ECSA` still redirect via Redis since those links are already shared.
- [x] Ambassador commission per job — every job is allocated to an ambassador (10/12/15% or a custom rate) or None, from the new-project form, the job's Financials tab, or Tracking → Log job. The commission comes off the job price, is logged as an "Ambassador commission" expense, and the ambassador is emailed (public-intake referrals: on downpayment verification). Cancel/refund releases it. `/admin/ambassadors` is native HQ tabs (Ambassadors · Tracking · Applications · Schools) — the old panel iframe is gone.
- [x] Parent/sub ambassador chain — an ambassador's page can link them under a parent (max 5 subs, one level deep); the parent earns their own admin-set rate (default in Settings, override per pair) from the sub's jobs once the parent reaches Silver, off the same job price, logged as its own "Parent ambassador commission" expense, and paid out together with the parent's own commission. Message (one ambassador) and Broadcast (all active, with email) send from `/admin/ambassadors/[id]` and Tracking.
- [ ] Service price sync from the flyers — drafted in `prisma/catalogue.ts`; run `npm run catalogue:sync` to review, `-- --apply` only after owner approval
- [ ] Production deployment
