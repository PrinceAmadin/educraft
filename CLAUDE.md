# CLAUDE.md — EduCraft HQ

## Project Overview

EduCraft HQ is a full-stack operations platform for EduCraft, a Nigerian academic services company. It manages the entire business: client intake, project tracking, worker assignment, quality assurance, ambassador management, financial reporting, and delivery.

EduCraft provides academic writing (final year projects, seminar reports, term papers, IT reports), presentations, CV/resume design, editing, and publication services to university students across Nigeria. The platform is scaling from ~100 projects/year toward 15,000 projects/year (₦1 billion revenue target).

**Founder:** Prince Amadin (amadinprince26@gmail.com)
**Contact:** 07063421088 | educraft611@gmail.com
**Brand tagline:** "EduCraft — Providing Affordable Academic Services"

## Deployment policy

**Push directly to `main` (production) at the end of every session — not a feature branch.** The app has no real users yet; the founder is the only person using it, so production and preview are the same thing right now, and a feature branch just adds a manual merge step for no benefit. Don't ask before pushing to `main` under this policy — it's standing authorization, not a one-off.

This reverses once the app goes live to real users — the founder will say explicitly when that happens. From that point, go back to feature branches / PRs for review before touching `main`.

## AI usage tracking

Every Claude call made through `src/lib/anthropic.ts` is logged to `AiUsageLog` (pass `usage: {...}` to attribute it) and shown at `/admin/finance/ai-usage`. Since Phase 2 the logger also keeps one Operations Reserve expense per project/subsystem per day in step with the log (`rollUpAiExpense` in `services/expenses.ts`, kind `AI`, category "API cost", kobo kept, locked against deletion), so Claude spend appears in Expenses and leaves the bucket automatically. Costs convert USD to naira at `USD_NGN_RATE` (env var, default 1500) — change it in Vercel and redeploy, no code edit; the rate is stored per row at log time, so old rows keep theirs. Model prices live in `src/lib/ai-usage-log.ts`. Anthropic has no credit-balance API, so the balance is entered manually (super admin) and HQ subtracts logged spend from it.

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
npm run check:rbac             # Access rules vs the executive tab matrix (no DB) — run after touching rbac.ts / sidebar-config.ts
npm run check:finance          # The Phase 2 finance maths vs the spec (no DB) — run after touching src/lib/finance/commission-config.ts
npm run finance:backfill       # Dry run: money confirmed before the finance platform -> buckets, AI usage -> expenses (add -- --apply to write; idempotent)

# Build
npm run build                  # Production build
npm run lint                   # Lint check
```

**CRITICAL:** Never run `npx prisma migrate dev` directly. Always use `npm run db:migrate`. Prisma CLI reads `.env`, not `.env.local`. The npm scripts use `dotenv-cli` to load `.env.local` correctly.

## User Roles

Four executive roles run HQ (RBAC Phase 1, Sept 2026 — spec: `DATA/EDUCRAFT_RBAC/EDUCRAFT_Phase1_RBAC_Build.md`). Each executive sees only their own domain's tabs and is silently sent home from any other; the Super Admin sees everything and is the only one who assigns roles (Settings > Team & roles).

| Role | Who | What they see | Home |
|---|---|---|---|
| SUPER_ADMIN | Prince Amadin (CEO & Chief Product Officer) | Everything. The only role that assigns roles, edits services/pricing, edits clients | `/admin` (Command Center) |
| CO_CEO_CFO | Jubilee Abiodun (Co-CEO & CFO) | The Finance Platform (dashboard, revenue, payouts, buckets, founder draws, expenses, AI usage, reports — tabs under `/admin/finance`), Clients (read-only), Bank details | `/admin/finance` |
| HOG | Ayomidele Smith Oyomire (Head of Growth) | Ambassadors (incl. the Sponsorship tab: Growth Fund budget + logging sponsorships), Growth, Growth reports, Bank details | `/admin/ambassadors` |
| COO | Emmanuel Mebawondu (Chief Operating Officer) | Projects, QA Review, Research approvals, Client inbox, Workers, Clients (read-only), Payouts (`/admin/finance/payouts`: the worker list only — review and submit to the CFO, never mark paid; marks client payments paid, finance verifies), Operations reports, Bank details | `/admin/projects` |
| WORKER | | Own assignments, earnings, stats only | `/worker` |
| AMBASSADOR | | Own referrals, commissions, leaderboard only | `/ambassador` |
| CLIENT | | Own projects, status, downloads | `/client` |

`OPS_MANAGER` is retired: the enum value stays (no login holds it, nothing offers it) and `effectiveRole()` in `src/lib/rbac.ts` treats it as COO.

### Tab matrix (source of truth: `ROUTE_PERMISSIONS` in `src/lib/rbac.ts`; `npm run check:rbac` enforces it)

| Tab / route | SUPER_ADMIN | CO_CEO_CFO | HOG | COO |
|---|---|---|---|---|
| Command Center `/admin` | Full | — | — | — |
| Projects `/admin/projects` · QA `/admin/qa` · Research approvals `/admin/research-requests` · Client inbox `/admin/client-inbox` · Workers `/admin/workers` | Full | — | — | Full |
| Clients `/admin/clients` | Full | Read-only | — | Read-only |
| Ambassadors `/admin/ambassadors` · Growth `/admin/growth` | Full | — | Full | — |
| Finance `/admin/finance` (incl. expenses, reconciliation) · AI usage `/admin/finance/ai-usage` | Full | Full | — | — |
| Payout queue `/admin/finance/payouts` | Full | Full | — | Review only |
| Reports `/admin/reports/finance` / `growth` / `operations` (`/admin/reports` forwards each role to theirs) | All three | Finance | Growth | Operations |
| Settings: General `/admin/settings` · Team & roles `/admin/settings/team` · Services `/admin/settings/services` | Full | — | — | — |
| Bank details `/admin/settings/bank` | Everyone's | Own | Own | Own |

Anything under `/admin` that no row names is SUPER_ADMIN only (fail closed). `/api/admin/*` is judged by the same table (`API_PERMISSIONS`, method-aware: the CFO and COO may only GET `/api/admin/clients`; marking payouts paid is founder + CFO).

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
│   ├── forms/             # Field, FormSection, FormActions, StepShell, TagInput, UniversityCombobox
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

**ID formats** (single source: `src/lib/id-format.ts`; `nextId()` in `projects.ts` hands out the highest number + 1, never a row count):
- Client: `ECC-0001` (4-digit minimum; ONE per person, a returning client's new order joins it by email). Was `EC-C-XXXXX` until Sept 2026. Do not confuse with core ambassador slots `ECCA-001`: keep regexes anchored.
- Project: `EC-XXXXX`
- Worker: `ECW-0001` (was `EC-W-XXXXX`)
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

**Revenue split per project (v2.0, Sept 2026 — the section below is the source of truth and overrides the earlier "40% / 10–15% / 45–50%" split):** workers 40%, ambassadors 15% in total (the referrer's tier rate, the rest to their Core), HOG 2.5%, COO 2.5%, EduCraft retains 40% and splits it into four buckets.

Commission is paid to ambassadors immediately when the client pays the downpayment (not on project completion).

## EduCraft Commission Structure (v2.0 — September 2026)

Recorded for Phase 2 (the Finance Platform's payout engine and bucket manager); Phase 1 built no commission logic, so the live code still runs the earlier rules where noted. Cashflow reference: `EduCraft_Cashflow_v2.0.docx` (founder's Downloads).

### Revenue Split (per project, no Growth Associate)
- Workers:              40% of project value
- Ambassador:           15% of project value (EduCraft always pays 15% total)
- HOG (Ayomidele):      2.5% of project value (all ambassador-driven projects)
- COO (Emmanuel):       2.5% of project value (all delivered projects)
- EduCraft retains:     40% of project value

### Ambassador Tier Rates (lifetime conversions = paying clients referred)
- Bronze (0–5):         10%
- Silver (6–15):        12%
- Gold (16–30):         15%
- Platinum (31+):       15% + ₦3,000 quarterly bonus per client referred

### Core/Sub Override (EduCraft always pays 15% total)
- Sub at Bronze → Core override: 5%   (Sub: 10%, Core: 5%)
- Sub at Silver → Core override: 3%   (Sub: 12%, Core: 3%)
- Sub at Gold/Platinum → Core: 0%     (Sub: 15%, Core: 0%)
- Max 10 Sub-Ambassadors per Core
- Core must be Silver+ to activate sub-team

### Growth Associates (Year 2 — currently inactive)
- Earn: 2% from EduCraft's retained share
- When active: EduCraft retains 38% instead of 40%

### EduCraft Bucket Allocation (from the 40% retained share)
- Operations Reserve:   37.5% of retained = 15% of total revenue
- Growth Fund:          17.5% of retained = 7% of total revenue
- Reinvestment Fund:    17.5% of retained = 7% of total revenue
- Founder Distribution: 27.5% of retained = 11% of total revenue

### Founder Monthly Draw (revenue-tiered, 50/50 split)
- Below ₦500K/month:          ₦0 each
- ₦500K–₦999,999:             ₦25,000 each
- ₦1M–₦2,499,999:             ₦75,000 each
- ₦2.5M–₦4,999,999:           ₦150,000 each
- ₦5M–₦9,999,999:             ₦300,000 each
- ₦10M+:                      ₦500,000+ each (reviewed quarterly)

### Executive Performance Bonuses
#### HOG
- Ambassador activation rate > 30%/month:    ₦50,000
- New school to 10+ active clients:          ₦30,000
- Per ambassador completing quarterly challenge: ₦10,000
- New client target exceeded by > 20%:       ₦75,000

#### COO
- QA first-pass rate > 85%/month:            ₦30,000
- On-time delivery rate > 97%:               ₦30,000
- Zero supervisor rejections in a month:     ₦50,000
- Client satisfaction > 90% positive:        ₦25,000

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

**Tiers (lifetime paying clients referred):** Bronze 0–5 → 10%, Silver 6–15 → 12%, Gold 16–30 → 15%, Platinum 31+ → 15% + ₦3,000 quarterly bonus per client referred.

**Core/Sub chain (v2.0 — EduCraft always pays 15% in total):** Sub at Bronze → Sub 10% + Core 5%; Sub at Silver → Sub 12% + Core 3%; Sub at Gold/Platinum → Sub 15% + Core 0%. One level deep, the Core must be Silver+. Live since Phase 2: `resolveParentCommission(childId, childRatePercent)` in `ambassador-commission.ts` gives the Core 15 minus the sub's rate on the job; a rate set on the link (`Ambassador.parentCommRate` with `parentCommRateIsOverride`) can only lower that. The `parent_commission_rate` Setting is no longer the default. Max subs per Core is still `MAX_SUB_AMBASSADORS` (5) in `src/lib/commission.ts`.

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
- [x] Paystack integration (test mode) — `src/lib/paystack.ts` + `src/lib/services/paystack-payments.ts`: initialize a downpayment/balance transaction (`POST /api/payments/paystack/initialize`, "Pay with Paystack" on `/intake/success` and `/track/[projectId]`), a signature-verified + server-to-server re-verified webhook (`POST /api/webhooks/paystack`) that auto-advances `NEW→DOWNPAYMENT_VERIFIED` / `APPROVED→BALANCE_VERIFIED`, and an admin reconciliation view (`/admin/finance/reconciliation`, linked from `/admin/finance`) that cross-checks Paystack's own transaction list against local Payment records with a manual "Sync" for any missed webhook. Callback URLs derive from Vercel's own `VERCEL_ENV`/`VERCEL_URL`/`VERCEL_PROJECT_PRODUCTION_URL` (never localhost on a real deploy) unless `PAYSTACK_CALLBACK_BASE_URL` is set explicitly. Still on test keys — switch `PAYSTACK_SECRET_KEY`/`PAYSTACK_PUBLIC_KEY` to live before real charges.
- [x] Pay-first public intake — fixed-price services (everything except `pricingModel: VARIABLE`) charge the downpayment *before* a Client/Project exists: the validated form is staged in a `PendingIntake` row, `POST /api/intake/initialize` starts the Paystack transaction, and only a confirmed webhook (`creditPendingIntake` in `paystack-payments.ts`) calls `submitIntake()` and marks the downpayment verified in one step — an abandoned checkout leaves no project behind. `/intake/success?ref=` polls `GET /api/intake/status` (client component `IntakeFinalizing`) until the webhook lands, since Paystack's redirect can beat it back to the browser; `?p=` (existing, still used by variable-priced services' direct-submit flow) is unchanged.
- [x] Notifications (in-app: topbar bell + feed, mark read/all; triggers for intake, payments, assignment, QA, revision cap, referral, payouts)
- [x] QA review system (queue + checklist per template + pass/revision/escalate)
- [x] Worker portal (dashboard, assignment detail with accept/submit, earnings, profile; strictly own-data scoped)
- [x] Ambassador portal (dashboard w/ referral link + QR, referrals, commissions, leaderboard, profile; own-data scoped)
- [x] Ambassador application (/apply + admin review/approve/reject)
- [x] Services page (/services)
- [x] Project tracker — now client-only (Sept 2026): `/client/projects/[projectId]` (`getClientTracking(code, scope.clientIds)` in `tracking.ts`, a project that is not the caller's is a 404). The public `/track` and `/track/[id]` only redirect to `/client/login`; Paystack's callback for project payments lands on `/client/projects/{id}?payment=success`.
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
- [x] Parent/sub ambassador chain — an ambassador's page can link them under a parent (max 5 subs, one level deep); the parent earns their own admin-set rate (default in Settings, override per pair) from the sub's jobs once the parent reaches Silver, off the same job price, logged as its own "Parent ambassador commission" expense, and paid out together with the parent's own commission. Message (one ambassador) sends from `/admin/ambassadors/[id]`; Broadcast (all active ambassadors with an email: email + in-app notification) is in the header of every `/admin/ambassadors` tab (`BroadcastAction`, which counts the same pool the send uses). **Admin edit/delete (Sept 2026):** `/admin/ambassadors/[id]` has Edit (`EditAmbassadorDialog`: name, phone, email, university, department, level, bank details; sends only changed fields) and, for super admins, Delete (`DeleteAmbassadorButton`). `updateAmbassador` copies a name change to their roster slot and an email change to their login when the login still uses the old address (and to a worker profile on that login with the same old address), refusing an email another login owns. `deleteAmbassador` refuses anyone with jobs, referred clients or subs (Terminate them instead), empties their slot and switches off the login unless it has an active worker profile. Referral code, slot and parent are not editable there.
- [x] Ambassador roster + slots (Sept 2026) — the old panel's structure, in Postgres: `AmbassadorSlot` (kind GENERAL/CORE/SUB, `code` "001"/"ECCA-001"/"ECSA-001-001") seeded by `npm run roster:seed` from `prisma/ambassador-roster.ts` (66 general slots, 6 Core, 5 Sub — transcribed from the live panel; the old repo's `ambassadors.ts` is stale). A filled slot joins its `Ambassador` via `legacySlotId = code`. `/admin/ambassadors` tabs: Ambassadors · Schools · Core · Sub · Applications · Tracking · Manage. Manage edits are instant (no GitHub deploy). `/EduCraftA/{n}`, `/ECCA/{id}`, `/ECSA/{id}` now read names from the DB; click counts stay in Redis. `/apply` auto-assigns a slot (first vacant not held by a pending application, else next number), collects email + password (login created `isActive:false`, like worker applications); approval fills the slot, activates the login and emails a welcome (`src/lib/emails/ambassador-welcome.ts`); rejection releases the slot and deletes the inactive login. Ambassador-facing analytics dashboard still to build.
- [x] Ambassador click analytics (Sept 2026) — every hit on `/EduCraftA/{n}`, `/ECCA/{id}`, `/ECSA/{id}` is stored as a `ClickEvent` (geo from Vercel `x-vercel-ip-*` headers, device/browser, UNIQUE/RETURN/DUPLICATE/BOT quality; written via `waitUntil`, Redis counters kept as the legacy baseline). Ambassadors get `/ambassador/link` (Overview, Analytics, Quality, History, Raw log + CSV) and `/ambassador/leaderboard` (unique clicks only, Daily/Weekly/All time, top 10 + See all; orders/conversion are private to each ambassador and never on the board). Admins get `/admin/ambassadors/[id]?view=analytics` with a date range, CSV and Reset click count. Times are WAT. **Weekly email:** `GET /api/cron/ambassador-weekly-report` runs Mondays 07:00 UTC (08:00 WAT) from `vercel.json`; it needs `CRON_SECRET` in Vercel env (the route refuses to send without it), `?preview=true` (admin session) renders an email without sending, `?dry=true` counts recipients, and a Setting row prevents a week being sent twice. **Opt-out:** only the weekly summary is optional (`Ambassador.weeklyEmailOptOut`; welcome and commission emails are transactional). Every weekly email carries a signed, never-expiring `/unsubscribe/weekly?t=` link (`src/lib/unsubscribe.ts`, HMAC under `AUTH_SECRET`; the page asks before changing anything so mail scanners cannot unsubscribe people) plus `List-Unsubscribe` / one-click headers, and ambassadors have a toggle on `/ambassador/profile`. The preview link is inert on purpose.
- [ ] Service price sync from the flyers — drafted in `prisma/catalogue.ts`; run `npm run catalogue:sync` to review, `-- --apply` only after owner approval
- [x] Research pipeline (Report Production System §Sub-System 1) — worker's "Step 1 — Research" panel on `/worker/projects/[id]` (`ResearchPanel`) finds, sorts and classifies academic references before any report writing begins. **OpenAlex-native, two-track (Sept 2026):** Claude (`src/lib/anthropic.ts`) writes ~10+ academic search queries (~1 in 5 "foundational", any year sorted by citations); each runs against OpenAlex (`src/lib/openalex.ts`, 250M+ works, free) which returns real published works with DOI, authors, year, journal, abstract and citation count — so there is no DOI-verification step and no CrossRef. (The first version had Claude recall paper titles and verify them via CrossRef; only ~4% of recalled titles existed, giving ~6 references from 190 candidates.) Open-access status decides delivery, never survival: Track A = a PDF that really serves PDF bytes, probed via Unpaywall (`src/lib/unpaywall.ts`) plus OpenAlex's own links — **both are needed and always probed**: on a live test OpenAlex reported a `pdf_url` for 70/80 papers but only 14 actually downloaded, and Unpaywall found 8 more (~57% extra); Track B = paywalled, kept reference-only. Track A PDFs upload to Google Drive (`src/lib/google-drive.ts`, OAuth-delegated — service accounts have no quota on personal Drive) under `EduCraft Research/{project_id}/`; Track B is listed with DOI links in a "Paywalled References — Access via your university library" Google Doc in the same folder. Both tracks go through Tier 2 relevance (CORE/CLOSELY_RELATED/TANGENTIAL/IRRELEVANT); TANGENTIAL/IRRELEVANT are always dropped (kept set is 100% CORE+CLOSELY_RELATED), first round fetches 150 candidates, up to 3 replacement rounds until 50 are kept (`TARGET_REFERENCES`), kept set capped at 70 (`MAX_REFERENCES`, CORE then most-cited first), <50 relevant after the rounds → admin review, <10 CORE → passes with a warning. **No Zotero in the pipeline** — references live in the `Reference` table; "References list" (`GET .../research/references-doc`, `src/lib/research-references-doc.ts`) downloads every kept reference as a plain black-and-white Word document (Times New Roman 12pt, double spaced, justified, 1 inch margins, hanging indent; de-duplicated by DOI/title, alphabetical, in the project's referencing style, journals and et al. italic) that can be sent to clients, and "Run research again" (`POST .../research/rerun`) wipes a job's Drive output (and any legacy Zotero items from older jobs) and is **rationed because every run spends Claude credits** (`src/lib/services/research-runs.ts`): a project's first run and its first re-run are free; from the second re-run the worker sends a written reason (`POST .../research/rerun-request`), a manager/admin approves or declines it at `/admin/research-requests` (declines need a note), and an approval is one run within 24h. Enforced server-side under a row lock on the project (two simultaneous clicks can't share one allowance), a refused re-run deletes nothing, and the run history lives in `ResearchRunLog` because a re-run deletes the job. Admins are notified of requests and workers of decisions in-app. `src/lib/zotero.ts` remains only for that legacy cleanup; `ZOTERO_*` env vars are no longer required. Modeled as a resumable step-chained job (`ResearchJob`/`Reference` tables, `src/lib/services/research.ts`) driven by the worker's browser polling `POST /api/worker/projects/[id]/research/step` — required because Vercel Hobby's short function timeout can't hold a multi-minute pipeline in one request; the job runs **on the server**, so workers can close the page or lock their phone: an invocation ("slice", `POST /api/internal/research/step`, HMAC-signed with `AUTH_SECRET`, answers 202 and works in `waitUntil` from `@vercel/functions`, `maxDuration` 300) runs steps back-to-back for ~3.5 min then schedules the next slice (`src/lib/services/research-runner.ts`). **Vercel returns HTTP 508 INFINITE_LOOP_DETECTED when functions call each other >5 deep — verified, however the call is made — so one-step-per-invocation chaining fails on the 5th hop; that is why slices are long.** A job needing more than ~4 slices pauses until resumed. A lease (`ResearchJob.lockedUntil`, renewed every step) means a chain and a Resume can never run the same job at once; failing steps retry 4× with growing delay, then pause and notify the worker; the panel is just a 3s poller that auto-restarts a run gone quiet for 2.5 min (`POST .../research/resume`). If a chain link is ever lost the job simply stops advancing until something resumes it — there is no cron watchdog. It calls itself at `VERCEL_PROJECT_PRODUCTION_URL` (override: `RESEARCH_BASE_URL`; if Deployment Protection is on, set `VERCEL_AUTOMATION_BYPASS_SECRET`). The panel shows a live "Step N of 4 · about X min left" estimate (`src/lib/research-eta.ts`: remaining steps × per-phase step time, seeded from a measured 255s full run on production). (Legacy enum values `VERIFYING_DOIS`, `IMPORTING_ZOTERO`, `DOI_REJECTED`, `NO_OA_PDF` remain for old rows.)
- [x] Worker registration + approval (Phase A of Worker Management) — workers self-register at `/apply/worker` (one scrolling form, same convention as the ambassador `/apply` and admin "Add worker" forms — not a step wizard) and set their own password there; a `User` (role WORKER) is created immediately but `isActive: false`, which is what actually blocks sign-in (`authorize()` in `src/lib/auth.ts` already checked this — no auth changes needed) until an admin approves. `WorkerApplication` mirrors `AmbassadorApplication`'s `ApplicationStatus` (PENDING/APPROVED/REJECTED) — reused, not duplicated. Admin reviews at `/admin/workers/applications` (linked from `/admin/workers`, renamed "Manage Workers", with a live pending-count badge): edit-before-deciding, approve (creates the `Worker` row, links the existing `User`, flips `isActive: true`), or reject. `Worker.status` changes now sync `User.isActive` the same way (Suspended/Terminated blocks login, Active/On Break restores it — closes a pre-existing gap where a suspended worker's login kept working). General admin edit (`EditWorkerDialog`) and worker self-edit (`WorkerIntakeForm`, phone/email/education/specialties/skills — name/status/capacity stay admin-only) both write `updatedById`/`updatedByRole` on `Worker` for a "last updated by admin/worker (name) · date" audit line shown on both the admin detail page and the worker's own profile. Every mutation is scoped server-side by session (`requireAdmin`/`requireWorker`), independent of the pre-existing role-based middleware (which only covers page navigation, not `/api/*`) — verified live: a WORKER-authenticated session gets a 403 from the admin PATCH endpoint even with a hand-crafted request. Still open: the "Manage Workers" stats row.
- [x] Project row actions (right-click/three-dot) — `ProjectRowMenu`/`ProjectRowMenuButton` give every project row a right-click context menu (desktop) and a three-dot button (works by tap everywhere, including mobile, where there's no long-press/right-click equivalent) that expose identical actions through the same API calls: view, assign/reassign/remove assignment, mark paid, verify payment. `assignWorker` now supports reassignment for `ASSIGNED`/`IN_PROGRESS`/`AWAITING_CLIENT_INPUT`/`REVISION_NEEDED` (previously only the first assignment out of `REQUIREMENTS_CONFIRMED` worked at all), with a paired `unassignWorker` + `POST /api/admin/projects/[id]/unassign` for undoing an unaccepted assignment. `ProjectActions` on the detail page explains *why* there's no Assign button (waiting on downpayment vs. wrong status) instead of just not showing one.
- [x] Client sign-in (Sept 2026) — `/client/login`: **Client ID or email + a password the client sets once.** First time (or forgot): the ID or email requests a 6-digit code emailed ONLY to the email already on the client record (`POST /api/client/otp/request`, no email field, says plainly whether the ID or email is registered (see "Forgot password says who you are" below), code hashed, 10 min, single use, superseded by a newer one, locked after 5 wrong tries, 60 s cooldown, 3 per 15 min, per-IP caps in Postgres), then `POST /api/client/password/set` (code + new password) stores a bcrypt hash and signs them in; afterwards ID + password only (NextAuth provider `client-password`; 10 wrong passwords per account per 15 min locks it). The password is never emailed. One `User` per email, linked to every `Client` row sharing it, so one login shows all their projects; since the one-login change (see "One login, one dashboard" below) that login may be a worker's or ambassador's, and only a staff email can never be a client's. Email is now required at intake; admins fix/add it on `/admin/clients/[id]` (`PATCH /api/admin/clients/[id]/email`; changing it unlinks the old login). `/client` is a placeholder for the real dashboard: use `getClientScope()`/`requireClient()` from `src/lib/api.ts` and filter every query by `scope.clientIds`. Core in `src/lib/services/client-otp.ts`. Gmail SMTP (~500/day) is the ceiling for codes at scale: swap the provider inside `sendMail`.
- [x] One login for worker + ambassador (Sept 2026) — a person is identified by the email on their `Worker`/`Ambassador` record, not by role; one `User` can own both profiles (schema always allowed it). `/login/set-password` (linked from `/login`, the forgot-password page for workers, ambassadors and clients) takes an email or EC-A-/EC-W- ID, emails a 6-digit code ONLY to the address on record (same safety rules as client sign-in, `PortalLoginCode` keyed by email, `src/lib/services/portal-otp.ts`, `/api/portal/otp/request` + `/api/portal/password/set`), then sets the password of the ONE login the person's profiles already sit on (found from the profiles carrying that email, so a stale same-email login cannot block it; the code only ever sets the password of a login whose OWN email is the inbox it was sent to, so a record whose email differs from its linked login's email is refused and an admin must align them; the reply names the email to sign in with and `/login` prefills it), creating a login if there is none and attaching any unlinked profile. A profile already on another login is never moved; staff/client emails, suspended logins and pending applicants are refused; an inactive leftover login from a rejected application with nothing attached is reactivated and reused. Every refusal is told to the caller as a `status` and also logged as `[portal-otp] no code sent (<status>): <reason>` / `[client-otp] no code sent (<status>): …` in Vercel runtime logs: check there first when someone says no code arrived. Which portals a login has is read from the database on every dashboard load (`portalsForUser` in `src/lib/auth.ts`, used by `(dashboard)/layout.tsx`), never from the JWT, so linking or approving a second role shows up without signing in again. `middleware.ts` lets WORKER/AMBASSADOR logins into either root (the edge cannot query the DB); `worker/layout.tsx` and `ambassador/layout.tsx` call `requirePortalProfile` (`src/lib/portal-access-guard.ts`) which requires that profile in good standing (worker Active/On Break, ambassador Active), and `requireWorker`/`requireAmbassador` do the same for APIs. `DashboardShell` picks the sidebar/nav from the URL with a "Switch to … dashboard" item in the account menu. Suspending or deleting a worker no longer closes a login that still has an active ambassador profile (`hasActiveAmbassador` in `workers.ts`). Admin detail pages show an "Also an ambassador / Also a worker" link (`LinkedProfileLink`, `linked-profiles.ts`); the two list pages do not. **Applying for the other role:** a worker applying at `/apply`, or an ambassador at `/apply/worker`, with the email of their active login: the API answers 409 `code: VERIFY_EMAIL` and emails a code (`findLoginForApplication`/`sendApplicationCode`/`verifyApplicationCode` in `portal-otp.ts`); the form then asks for it (`emailCode`), the application attaches to the existing `User` (no new login, password untouched), and approval adds the profile to that login.
- [x] Pro bono projects (Sept 2026) — `Project.isProBono` (+ `proBonoReason`). A pro bono job is a normal project with no money on it: `proBonoFinancials()` in `src/lib/pro-bono.ts` sets price 0, both payment legs `Verified` (so pipeline guards pass with no `Payment` row ever existing), and every payout leg pre-marked paid (so the payout queues skip it); it opens at `DOWNPAYMENT_VERIFIED`, and `transitionProject` auto-advances `APPROVED → BALANCE_VERIFIED` (logged). Revenue on the finance dashboard is payment-based so it excludes them by construction; the project-based figures (`getBusinessIntelligence`, outstanding balances) filter `isProBono: false`. Three ways in, **super admin only** (giving work away is a pricing decision): (1) a one-time link from `/admin/projects/probono` (`ProBonoInvite`, `src/lib/services/probono.ts`) — `/probono/[token]` shows the normal intake form with no price, referral or express; the first *browser* to open it is bound (`POST /api/probono/[token]/claim` sets an httpOnly cookie, only its sha256 is stored) and any other device is refused; the claim is a JS POST, never the page GET, so link-preview crawlers (WhatsApp) can't take the link; submitting consumes it atomically and hands it back if project creation fails; admins can **Free device** (client opened it in WhatsApp's in-app browser then switched) or Revoke; (2) a "Pro bono" switch on New project; (3) "Mark as pro bono" on an existing project's Financials tab (`markProjectProBono`, one-way, refused once payments or a paid commission exist; releases unpaid commission). Worker payout on pro bono is 0 — change `proBonoFinancials()` if workers should still be paid.
- [x] Admin edit of intake details (Sept 2026) — `/admin/projects/[id]/edit-intake` (button on the Requirements tab), `PATCH /api/admin/projects/[id]/intake` (`requireAdmin`; there is no client route that can edit a submitted brief). Field list and per-template visibility live in `src/lib/intake-fields.ts`; the service (`intake-edit.ts`) applies only changed fields, writes "Intake details edited by admin: …" to the timeline, and notifies an assigned worker. Not editable here: price/express/referral/payments (own controls) and anything credential-like (the intake collects none; client passwords live on `User`). Email goes through the guarded `updateClientEmail`. Client details are shared across that client's projects.
- [x] Old ambassador links forwarded to HQ (Sept 2026) — the standalone panel (Vercel project `educraft-ambassador`, `prj_4J8fHbQaS1PTz62oRFR1c0vxrwSv`, team `educraft611-7052s-projects`) has four project-level 307 redirects (set in Vercel, no code): `/EduCraftA/:id`, `/ECCA/:id`, `/ECSA/:id`, `/apply` -> the same path on `educraft-hq.vercel.app`. Old-URL clicks therefore land on HQ and are recorded once (`ClickEvent` + Redis), so old and new URLs are one analytics stream; the old app no longer counts. Undo: restore the previous route version (there was none, i.e. no redirects) with `update_route_versions`.
- [x] Installable app / PWA (Sept 2026) — one install for admin, worker and ambassador: `src/app/manifest.ts` (`start_url: /dashboard`, which routes by role), icons in `public/icons/` (EC monogram: white E nested in an open C on `#12827c`, no text — the launcher prints the name; `icon.svg` is the source for store listings; maskable + opaque iOS icon + transparent status-bar badge; icons are cache-first in the service worker, so bump `VERSION` in `sw.js` whenever they change), install prompt (`PwaProvider` in `providers.tsx`, `PwaBanner`, "Install app" in the account menu and mobile More sheet, Share → Add to Home Screen steps on iOS). `public/sw.js` (hand-written, production only) precaches the shell and serves `/offline` ("Reconnecting…") for anything not safely saved. **Offline rule:** only a short allowlist of worker/ambassador pages (`OFFLINE_OK` in `sw.js`) keeps a last-seen copy, in a cache keyed by user id; admin pages, `/api`, earnings, commissions and every money page are never saved. `OfflineBanner` labels a saved page with when it was last seen (it probes `/api/auth/session`, because `navigator.onLine` lies on weak signal); failed saves get a clear 503 "you're offline". Saved pages and push registration are wiped on every sign-out (`signOutAndClear`, `src/lib/pwa/sign-out.ts`). The service worker only clears its saved pages when the server confirms signed-out — offline, next-auth also reports null. **Push:** `PushSubscription` table; `notifyUsers` in `notifications.ts` also sends a web push (`src/lib/services/push.ts`, `waitUntil`, prunes dead devices; a message mentioning money is replaced with a generic line for the lock screen); toggle in the account menu + a banner once installed; needs `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` in Vercel (push is a silent no-op without them). Store apps later: TWA (Play) / Capacitor (App Store) wrap this same PWA.
- [x] Landing depth pass (Sept 2026) — section grounds alternate strictly A (page) / B (teal-tinted `--ground-b`) so every section edge shows without a rule; paper sheets lost their `clip-path` cut corners (clip-path was clipping their own shadows, which is why they blended into the page) and the cut-corner motif is gone site-wide (`CUT_CORNER` is now `rounded-xl`); bento tiles are deep-teal with a foot-weighted scrim and a lift shadow, and the CV & Career tile uses the same ground with every `cv_img` sample fanned as a cycling deck (`CvCarousel`). The hero stack (`scene/PaperStack.tsx`) is interactive CSS 3D — pointer/finger tilt, Android device tilt (never prompts for permission), scroll-driven depth spread, idle float — with no WebGL (it was removed earlier for low-end Android cost; keep it that way).
- [x] Stepped apply forms (Sept 2026) — `/apply` and `/apply/worker` are four pages each (`StepShell` in `components/forms`): every step stays mounted (only `hidden`), so Back keeps values; each form owns `STEP_FIELDS` and checks refinement-based rules (password match, university) per page because `superRefine` never runs on a partial `trigger`. Same fields and API contracts as before. `ScrollNav` hides on `/apply`, `/intake`, `/probono` so it never covers the sticky Continue bar.
- [x] Service catalogue + intake fixes (Sept 2026) — the live catalogue was applied from `prisma/catalogue.ts` (`npm run catalogue:sync -- --apply`, founder-approved): prices now match the two flyers, and Documents & diagrams (watermark, PDF/image conversion, diagrams, UML) are retired (deactivated, not deleted). `/services` has tabs — Final year (first: `fyp` + `combos` groups), Other, All; a search spans every tab (`SERVICE_TABS` in `service-groups.ts`). Public intake now offers a service's options (`serviceVariantId`, e.g. With/Without Data Analysis, `VariantField`), priced server-side in both `submitIntake` and `initializeIntakePayment` (base + option add-on; an unknown option id is refused). **Client uploads:** `AttachmentsField` sends files straight from the browser to Vercel Blob (`POST /api/intake/upload` mints the token: documents/images only, 25 MB, `intake/` folder, random suffix; store `educraft-client-uploads`, `BLOB_READ_WRITE_TOKEN` is in Vercel env) and the form keeps only the Blob links in `attachments` (max 10, hostname must be `*.blob.vercel-storage.com`); `submitIntake` saves them as `ProjectFile` rows (`from_client` / `department_outline`). Blobs are public-by-unguessable-URL, not private; the upload route is unauthenticated like the intake form (no rate limit yet). The buttons keep the cut-corner (`CUT_CORNER`) — the founder prefers it; do not round or shadow them.
- [x] Chapter-based final year reports (Sept 2026) — service `FYP-CHAPTERS` ("Final Year Project (Chapter-based)", basePrice ₦70,000 = the full report without data analysis, option "With Data Analysis" +₦20,000 = ₦90,000). A client picks chapters; each is a share of the full report price (Ch1 12%, Ch2 18%, Ch3 30%, Ch4 35%, Ch5 5% = 100%, in `src/lib/chapter-pricing.ts`) and the total is the shares added up, shown line by line (`ChapterCalculator`, used on the Final year tab of `/services` and as step one of `/intake/FYP-CHAPTERS`; the price list hands `?chapters=1,2&option=` to the form). `intakeBasePrice()` is the single price function used by the form, `submitIntake` and `initializeIntakePayment`, so the shown price is the charged price. The project stores `additionalData.chapters`, `chapterCount`, and a first line in `specialInstructions` ("Chapter-based order: Chapter 1 and 2 only…") so workers and admins see it. Admin's manual New project form does not know chapter pricing: use a price override there. Files a client attaches (`from_client` and `department_outline`) show on both the admin Requirements tab and the worker's assignment page; the worker sees them once the project is assigned to them.
- [x] Paystack redirect + chapter tab (Sept 2026) — `callbackBaseUrl()` ignores a `PAYSTACK_CALLBACK_BASE_URL` that points at localhost when running on Vercel (`process.env.VERCEL`): that override had been copied from `.env.local` into Vercel and sent paying clients to `localhost:3000`. Fix the Vercel value too (delete it or set it to the real https origin) so nothing depends on the guard. `/intake/success` now shows the Client ID and a "Go to my dashboard" button to `/client/login?id=` (prefilled; clients sign in with the Client ID, not the project ID). Chapter-based FYP has its own tab on `/services` (not in Final year or All, no default selection, no promotional copy) and sits last in the `/intake` picker, because a chapter order earns less than a full report.
- [x] Pay-first no longer depends on the webhook arriving (Sept 2026) — a production test showed Paystack's test-mode webhook never reached `/api/webhooks/paystack` (no delivery in Vercel logs), so `/intake/success` sat on "Confirming your payment" forever. `GET /api/intake/status` now asks Paystack directly (`resyncPaystackReference`) whenever the reference is still pending and creates the project on the spot; the webhook, if it ever arrives, finds it done. `creditPendingIntake` takes an atomic claim (`PendingIntake.status` PENDING -> PROCESSING, a plain string column) so the poll, the webhook and an admin Sync can never create two projects for one payment; an unexpected error hands the claim back. Still worth setting the webhook URL in the Paystack dashboard (Settings -> API Keys & Webhooks, test and live) to `https://educraft-hq.vercel.app/api/webhooks/paystack`.
- [x] Intake steps really validate (Sept 2026) — `IntakeForm.next()` also runs the whole `intakeSubmitSchema` (terms treated as accepted) and blocks the step on any issue that belongs to it: the schema's `superRefine` rules (university, topic, per-template details) never ran while the terms box was empty, so a client could reach the last page with a field missing and the pay button then failed silently. A failed final submit now jumps to the first step with a problem and says so. **Paystack live:** `.env.local` now holds the LIVE keys (test keys commented above them), so anything run locally charges real money; Vercel needs `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` set to the live values and a redeploy. Live webhook URL: `https://educraft-hq.vercel.app/api/webhooks/paystack`.
- [x] Edit applications before deciding (Sept 2026) — pending ambassador applications have an Edit dialog on `/admin/ambassadors/applications` (`PATCH /api/admin/ambassadors/applications/[id]`, `editApplication` in `applications.ts`): every field they typed plus the held **slot ID** (any free general number, padded to 3 digits; refused if an ambassador or filled slot has it, or another pending application holds it). Worker applications already had Edit; both now keep the login in step: a name/email correction also updates the inactive login created at submission (so they sign in with the corrected email once approved), duplicates are checked against other pending applications, existing ambassadors/workers and logins, and the password is never touched. When the application sits on a login the person already uses (worker applying as ambassador or the reverse), the email is read-only (`emailLocked`). A custom high slot number moves the next auto-assigned slot after it (`nextGeneralCode` takes the max).
- [x] Gmail alerts + applicant decision emails (Sept 2026) — the team's Gmail is emailed when an ambassador applies (`submitApplication`), a worker applies (`submitWorkerApplication`), and a client's downpayment is confirmed by Paystack on an order (pay-first `processPendingIntake`, and variable-price orders paid later in `creditProjectPayment`). Not sent for a downpayment an admin verifies by hand, or for pro bono. Recipients: Settings > General > **Email alerts** (`alert_emails` Setting, comma-separated, Super Admin only: the settings route drops the field for OPS_MANAGER), default `amadinprince26@gmail.com` (`getAlertEmails` in `services/settings.ts`). Keep the list off `educraft611@gmail.com`: that account sends them, and Gmail files mail it sends to itself under Sent. Code: `src/lib/services/team-alerts.ts` (builds from the DB row, sends via `waitUntil` after the response, queued straight after the commit, logs `[team-alert] … sent to N inbox(es)` / `not sent: …` in Vercel logs; application alerts stop past 20 applications an hour so a flood can't use up the Gmail quota that client sign-in codes share) and templates in `src/lib/emails/team-alerts.ts`. A paid order whose project wasn't advanced (cancelled/on hold mid-checkout) is flagged "Decision needed"; a pay-first payment that could not become a project (`IntakeError`) raises an urgent in-app notification plus an "Action needed" email. **Applicants hear only the decision** (founder's call: nothing at submission): approved ambassador = existing `ambassadorWelcomeEmail` (button now `/ambassador`), approved worker = `workerApprovedEmail` (worker ID, button `/worker`), rejected ambassador/worker = `applicationRejectedEmail`; the admin's rejection note is internal and never quoted (`src/lib/emails/application-decision.ts`). Tested end to end in Chrome with a local Paystack stand-in (the commented test key in `.env.local` is no longer valid: Paystack answers "Invalid key"). **Links in emails** (buttons, referral and unsubscribe links) come from `siteUrl()` in `src/lib/site-url.ts`: always the live site (`NEXT_PUBLIC_SITE_URL` if set to an https address, else Vercel's production domain, else `https://educraft-hq.vercel.app`), never localhost or a preview URL, because local and preview runs share the live database and Gmail sender. Paystack's return address is the one exception and keeps `callbackBaseUrl()`.
- [x] Client IDs + sign-in fixes (Phase 0 of the client dashboard plan, Sept 2026) — client IDs are `ECC-0001`, worker IDs `ECW-0001` (`src/lib/id-format.ts`); `npm run migrate:ids` (dry run by default, `-- --apply`) merged client rows sharing an email into the oldest and rewrote old IDs keeping their numbers. **One client per person:** `submitIntake` attaches a returning email to the existing Client and never overwrites it from the public form; what was typed goes to `project.additionalData.submittedContact` (`src/lib/submitted-contact.ts`) and `OrderDetailsNotice` shows admins/workers where it differs. The admin New project form refuses a "new" client whose email is already on record. Sign-in takes a Client ID (typed loosely, e.g. `ecc 9`) or the email; codes are hashed with the Client row's internal id; a password sign-in links any unlinked rows with the same email. `/client/profile` (was a 404) shows details, change password (emailed code) and notifications; client pages have a layout guard, loading/error states and a project not-found; a branded root `not-found.tsx` sends signed-in people to their own dashboard. Clients sign out to `/client/login`; Topbar search is admin-only and searches projects. Sign-in redirects keep the query string (Paystack returns survive) and `/login` only follows same-site `callbackUrl`s. Security: stored file links render through `safeHref()` (`src/lib/safe-href.ts`), worker submit links must be https, and intake attachments must be on our own Blob store (host read from `BLOB_READ_WRITE_TOKEN` server-side). Plan for the rest (Progress/Payments/Messages, Documents, Requirements, corrections): see `~/.claude/plans/c-users-princ-downloads-new-folder-past-crispy-aho.md`.
- [x] Client dashboard Phase 1: Progress, Payments & receipts, Messages (Sept 2026) — `/client/projects/[code]` has tabs (`ClientProjectTabs`, links with `?tab=`, server renders only the open tab; on phones equal icon columns, no sideways scroll). **Rule: client pages read ONLY through `src/lib/services/client-portal.ts`** (scoped by `scope.clientIds`, whitelisted fields; never internal/QA notes, the status log, worker identity or `internalDeadline`); `npm run check:client-copy` fails on words like AI/QA/revision/worker/internal in client-facing files. **Progress:** `clientProgress()` (`src/lib/client-progress.ts`, pure) turns the 18 statuses into client steps, a headline and a percent; `Project.expectedDeliveryAt` is the date clients see (defaults to their deadline, moves with paused days, admin-editable), countdown pauses while AWAITING_CLIENT_INPUT; the activity feed is the `ProjectUpdate` table ONLY (client wording from `statusFeedEntry()` in `src/lib/client-updates.ts`, written in the same transaction as the status change, `dedupeKey` makes replays no-ops; admins post MANUAL updates and can hide lines). **Payments:** the balance is payable early from any working status once the downpayment is in (`balancePayable()` in `src/lib/payment-rules.ts`) via signed-in `POST /api/client/projects/[code]/pay`; the public `/api/payments/paystack/initialize` is downpayment-only now. If the balance is already paid when QA approves, `transitionProject` goes straight on to BALANCE_VERIFIED ("Balance already paid"). Coming back from Paystack the page calls `reconcileClientPayments` (asks Paystack directly), so no webhook is needed. PDF receipts per confirmed payment (`src/lib/receipts.ts`, jspdf, amounts as "NGN 1,575"). **Concurrency:** `transitionProject` is compare-and-set on the status it read; `creditProjectPayment` claims the Payment row first inside one transaction; `verifyPayment` claims the leg from "Paid" — double clicks, webhook retries and admin Syncs cannot double-apply (verified: 3 racing confirmations → 1 credit). **Messages:** `ProjectMessage` client <-> admin only (workers never see it), `src/lib/services/client-messages.ts`; the admin project page's "Messages" tab (replaced "Client update"; also the delivery date, feed and the research WhatsApp message) reads with `markRead:false` and `MessageThread` only refreshes/marks read while on screen; `/admin/client-inbox` lists threads waiting on us; Command Center counts them (over a day = urgent). **Notifying clients:** `notifyClient()` (`src/lib/services/client-notify.ts`) = bell + push always, email for key moments only, max once per project per kind per 30 min and `CLIENT_EMAIL_DAILY_CAP` (default 200, `EmailLog`) so sign-in codes keep their Gmail room. `/admin/projects/[id]/client-preview` renders the client's screen (`ClientProjectScreen`) read-only, as the leak check. The old `tracking.ts`/`ProjectTracker` are gone. Next: Phase 2 (Documents, private Blob store, research papers) per the plan file.
- [x] Client dashboard Phase 2: Documents, private files, research in-app (Sept 2026) — every project gets a list of **deliverables** (`ProjectDeliverable`, from `deliverableTemplate()` in `src/lib/deliverables.ts`, keyed by service code: full reports/thesis/combos = Chapter 1..N + "Complete project" (+ Proposal/Slides), chapter-based orders = the chapters ordered + "Complete document", everything else = one final). The worker uploads a **version** (`DeliverableVersion`) from the Documents tab of `/worker/projects/[id]` (now tabs Brief · Research · Documents; the paste-a-link submit form and `POST .../submit` are gone); an admin releases it to the client or returns it with a note from the new **Documents** tab on `/admin/projects/[id]` (also: upload EduCraft's own copy, rename/archive/add, access per item, WhatsApp message after a release). Clients see only released versions, numbered by release. **Download rule** (`deliverableGate()` in `src/lib/files/policy.ts`, pure, checked by `npm run check:client-access`): not released = hidden; refunded = locked; WITHHELD = locked; ALWAYS (super admin only) = open; cancelled = locked; no downpayment = locked; DOWNPAYMENT tier = open; BALANCE tier = open once the balance is verified. Full reports: Chapters 1–2 and the Proposal are DOWNPAYMENT, the rest BALANCE; chapter-based orders are all BALANCE; pro bono opens everything. Submitting the **complete document** moves the project to SUBMITTED (QA); a QA revision (any path into REVISION_NEEDED) returns it with the note; it can only be released after QA passes; releasing it at BALANCE_VERIFIED delivers the project, and a balance verified after it was released delivers too (`deliverIfFinalReleased`, called from `verifyPayment` and `creditProjectPayment`). BALANCE_VERIFIED -> DELIVERED is blocked while an uploaded complete document is unreleased (`finalAwaitingRelease` guard; old pasted-link projects are not held up). Release and return are claimed (`updateMany where status SUBMITTED`) and numbered under a row lock, so a double click gives one release and a 409. **Private files:** Vercel Blob store `educraft-private` (`store_5iS5bgfUBfa2KK30`, private, iad1, created with the Vercel MCP). `src/lib/files/storage.ts` is the only code that touches it and always passes credentials explicitly: `PRIVATE_BLOB_READ_WRITE_TOKEN` if set, else the deployment's Vercel OIDC token + `PRIVATE_BLOB_STORE_ID` (defaults to that store id); it never falls back to `BLOB_READ_WRITE_TOKEN` (the PUBLIC intake store). The store must be connected to the `educraft` project for OIDC to work (dashboard: Storage -> educraft-private -> Connect Project, prefix `PRIVATE_BLOB` so it can't clash with the intake store's `BLOB_` variables); `GET /api/health/files` answers `{driver, ok, error}` (read-only, cached 5 min) to check it. Uploads go browser -> store (`uploadPresigned`, parts over 8 MB): `POST /api/{worker|admin|client}/projects/[id]/upload` first hands out a random path `projects/{projectCuid}/{deliverable|message}/{targetId}/{random}.{ext}` (no names or codes in paths) with an HMAC ticket (`src/lib/files/ticket.ts`, AUTH_SECRET) and then presigns exactly that path; the action that registers the file re-checks the ticket (same user, <24 h), the size and the first bytes (`magicMatches`: HTML renamed .pdf is refused and deleted), and `blobPathname` is unique. Types per purpose and 50/25 MB limits in `policy.ts`; 100 uploads/user/day. Downloads only through `GET /api/{worker|admin|client}/projects/[id]/files/[fileId]` (`src/lib/services/file-access.ts`: admins any file; the assigned worker never message attachments or admin-hidden files, and loses access the moment the project is reassigned; clients only released+open deliverables and their own thread's attachments), streamed with no-store, nosniff and a sandbox CSP, named "EC-00008 Chapter 1.docx". Local dev: `PRIVATE_FILES_DRIVER=local` keeps files in `.private-files/` (git-ignored; refuses to run on Vercel). **Messages** carry attachments both ways (up to 5, `message_attachment` files). **Research in-app:** an admin shares a finished research job from the Documents tab (`ResearchJob.releasedToClientAt`, `src/lib/services/client-research.ts`); the client's Documents tab then lists the papers (title/authors/year/journal/DOI only), downloads open-access PDFs streamed from Drive (`downloadDriveFile`) and the reference list .docx; paywalled papers link to their DOI. The Drive link is never shown to clients; the research WhatsApp message now links the dashboard. A re-run deletes the job, so it must be shared again (the approval card warns). `/admin/client-inbox` also lists documents waiting for review and the Command Center counts them. Verified locally: a 47-check API run (release/lock/deliver, double clicks, other client 404, fake PDF, ticket theft, attachments, research) plus worker/admin/client screens at 375px light and dark.
- [x] Forgot password says who you are (Sept 2026, founder's call: no "if that matches an account…" guesswork) — `/login/set-password` is the one forgot-password page for workers, ambassadors AND clients: `POST /api/portal/otp/request` works out which the email or ID (EC-A-/ECW-/ECC-) belongs to; a client's gets a client code (`sendClientCode` in `client-otp.ts`) and the answer says `account: "client"`, so the form saves via `/api/client/password/set` and signs them into `/client`. Both request endpoints answer 200 `CodeRequestResult` (`src/lib/code-request.ts`): `sent` (+ `sentTo`, masked when an ID was typed), `wait` (60 s cooldown / 3 per 15 min, with `retryAfter` and `codeStillValid`, so the form goes to the code step when the last code still works), or a reason: `not_registered`, `invalid`, `no_email`, `pending` (application under review), `inactive`, `team` (client page only: links to the forgot-password page with `?email=`), `needs_admin`, `unavailable` (staff; never reset publicly). A page only points to another when a real record exists there (a bare leftover login never counts), so nobody bounces between pages. The per-IP cap (10 requests / 15 min) is now what stops the lookup being used to test lists of emails; code checks and password sign-in still fail with one answer.
- [x] One login, one dashboard for clients, workers and ambassadors (Sept 2026) — founder's call: a person is one login whatever mix of client orders, worker record and ambassador record they hold, with "Switch to client / worker / ambassador dashboard" in the account menu. `User.role` is only the dashboard they land on first (what they registered as); which dashboards open is read from the profiles on every load (`portalsForUser` in `auth.ts`, used by the `(dashboard)` layout: worker Active/On Break, ambassador Active, at least one linked `Client` row). `src/lib/roles.ts` (pure, used by middleware) holds the rules: staff (SUPER_ADMIN/OPS_MANAGER) stay in /admin only and never hold client orders; WORKER/AMBASSADOR/CLIENT logins pass the middleware into all three roots and each portal checks the real profile server-side (`requirePortalProfile` for /worker and /ambassador, `getClientScope` in `api.ts` for /client and its APIs; `requireWorker`/`requireAmbassador`/`requireClient` likewise), so a worker without orders is sent home from /client and a client without a worker record from /worker. **The email is the person (founder's rule, 2026-09-23):** every client order placed with an email joins the ACTIVE worker/ambassador/client login with that email (`src/lib/services/account-links.ts`: `loginForEmail` when a client is created at intake, by an admin or when an admin sets a client's email; `linkClientOrders` at sign-in, on every dashboard load in the `(dashboard)` layout, and first thing in `getClientScope`, so a new order shows on the next page without signing in again). Only active logins count: worker/ambassador logins are switched off until an admin approves the application (or the person uses an emailed code), client logins only exist after a code, so a pending or rejected applicant never collects anyone's orders. (It first required an emailed code before linking; the founder's own worker+ambassador email then couldn't see its order, and he set the rule to "the Gmail is the identifier".) `User.emailVerifiedAt` is still recorded whenever a code is used, but no longer gates linking. **Sign-in:** `/login` is the one sign-in page for everyone (email or Client ID + password; clients go through `verifyPassword` with its lockout); `/client/login` still works. A client code or client password for an order whose email is a worker's or ambassador's login now signs in to that one login (it used to say "ask an admin"); a client applying as a worker or ambassador gets the application code and the application joins their client login, approval adds the profile. **Sign-in pages no longer bounce a signed-in browser** to its current dashboard (that sent the founder, still signed in as admin, to the admin workers list when "signing in as a worker"): `/login` and `/client/login` show "You're already signed in as X" with Go to my dashboard / Sign out (which clears the device). A client-first login keeps the 14-day limit everywhere (`isClientSessionExpired`). Verified locally with a 34-check run against the real NextAuth endpoints (both sign-in pages, Client ID, shared dashboards, proved vs unproved linking, client applying as a worker end to end, staff separation, no admin access for workers or clients).
- [x] Client dashboard honesty pass (Sept 2026) — prompted by the founder's test client help.educraft@gmail.com showing four projects: they were all placed with that email (one client per person), so access was right, but the dashboard read as broken. `/client` now groups cards: In progress (paid, not finished), Waiting for your downpayment (no bar, no date, "Pay ₦X to start"), Delivered, Closed (`group` from `listClientProjectCards`). The step on screen uses in-progress wording (`CURRENT_LABELS` in `client-progress.ts`: "Choosing your specialist", never a past-tense "Specialist assigned" before it happened); an unpaid order shows no delivery date ("set once your downpayment is in") and no progress bar. The Payments tab says what the balance unlocks from the order's own deliverables (`describeUnlocks`, e.g. "Chapters 3 to 5 and your complete project", or just "Chapter 5"), and Documents says when an unreleased item opens (`notReadyHint`). Older projects got their Updates feed filled from real history with `npm run feed:backfill` (dry run; `-- --apply` writes; same dedupe keys as the live code, so re-runs add nothing; applied once: 21 lines on 8 projects).
- [x] RBAC Phase 1 — executive roles (Sept 2026) — built from `DATA/EDUCRAFT_RBAC/EDUCRAFT_Phase1_RBAC_Build.md`, one step at a time with a live check after each (sign-in through the real NextAuth endpoints as all four roles; see the "User Roles" section above for the matrix). **Schema:** `UserRole` gained `CO_CEO_CFO`, `HOG`, `COO` (`OPS_MANAGER` kept but retired ≡ COO); `ExecProfile` (name, title, email, phone, bank details) per executive login; `User.lastSignInAt` (stamped by `touchSignIn` on every password sign-in) is what makes an invited executive "pending" on Team & roles. `prisma/seed.ts` seeds the three executives with placeholder emails (jubilee@ / ayomidele@ / emmanuel@educraft.com — change them on Team & roles) and the one-time password `EduCraft2026!` (a re-seed never resets a password, role or bank details) plus the founder's own `ExecProfile`. Migrations were written by hand with `prisma migrate diff` and applied with `npm run db:deploy`, because `prisma migrate dev` refuses a non-interactive shell. **Rules:** `src/lib/rbac.ts` (pure, edge-safe): `ROUTE_PERMISSIONS`, `API_PERMISSIONS`, `canAccessRoute`, `canCallAdminApi`, `homeForRole` (re-exported from `auth.ts`), `effectiveRole`, `ROLE_BADGE`, `canMarkPayoutsPaid`, `clientsReadOnly`, `showsAiBalance`; `src/lib/roles.ts` `STAFF_ROLES` now lists all five staff values, so `isStaffRole` keeps executives out of client linking and password lookups. **Enforcement, three layers:** `src/middleware.ts` (matcher now includes `/api/admin/:path*`; pages → silent redirect to the role's home, APIs → 401/403 JSON; stamps `x-educraft-pathname`), `(dashboard)/admin/layout.tsx` (re-runs the table server-side from that header), and each handler (`requireAdmin` = any staff, `requireAdminRoles([...])` e.g. payouts founder + CFO, `requireSuperAdmin` for team/services/pricing/client edits; `/api/dashboard/summary` = whoever may open the Command Center). **Sidebar:** `src/lib/sidebar-config.ts` (every tab names its roles; per-role bottom nav; empty sections vanish; hidden tabs are not in the DOM), `navForRole("admin", userRole)`; `isActive` now lets the most specific entry win (Payout queue / AI usage under Finance). `npm run check:rbac` (`scripts/check-rbac.ts`, no DB) proves sidebar ⇄ route table, homes reachable, fail-closed, API rules, mobile nav ⊆ visible tabs — run it after touching `rbac.ts` or `sidebar-config.ts`. **Topbar:** executive's name (from `ExecProfile`, read fresh each load) + `RoleChip` (CEO teal · CFO gold · HOG green · COO purple; `--purple` token added in `globals.css`/Tailwind), Claude balance bolt only for SUPER_ADMIN/CFO, account-menu Settings points executives at Bank details. **Team & roles** (`/admin/settings/team`, `TeamRoles.tsx`, `src/lib/services/team.ts`, `validations/team.ts`): list with role chips and Pending sign-in / Switched off badges; Invite (creates login + record, one-time password shown once with Copy credentials — nothing emailed in Phase 1); Edit (name, role among CO_CEO_CFO/HOG/COO, title, email, phone; Reset password; Switch off/on login; Remove from team = role → WORKER, record deleted, login optionally switched off). SUPER_ADMIN can never be assigned, demoted or removed here; nobody can switch off or remove themselves. Routes: `GET/POST /api/admin/team`, `PATCH/DELETE /api/admin/team/[id]`, `POST /api/admin/team/[id]/reset-password` (the old `/api/admin/settings/team*` + `TeamManager` are gone). **Bank details:** `/admin/settings/bank` (`BankDetailsForm`, own only; SUPER_ADMIN everyone's) + `PATCH /api/admin/settings/bank` (`userId` only for SUPER_ADMIN); `SettingsTabs` takes `role` and hides itself when only one tab applies. **Reports** are three pages (`/admin/reports/finance|operations|growth`, each its slice of `getMonthlyReport` with its own month picker path and CSV/PDF via `ReportExportButtons include=`); `/admin/reports` forwards by role. `/admin/growth` is a real page carrying the Phase 3 scope (`InProgressNotice`). **Read-only Clients** for CFO/COO: `ClientEmailEditor`/`ClientNotes` `readOnly`, and `PATCH /api/admin/clients/[id]/email|notes` are `requireSuperAdmin`. **Payout queue** for the COO: review only (`PayoutQueue canMarkPaid`), no mark-paid controls, `POST /api/admin/finance/payouts` refuses with 403. Interpretations to know: `/admin/client-inbox` was not in the matrix and is treated as delivery (COO); the COO's "submit payout list" is Phase 2's payout engine; admin notifications (`notifyAdmins`) still go only to SUPER_ADMIN/OPS_MANAGER — routing payment/application/research alerts to the CFO/HOG/COO is for Phases 2–4. **Phase 2 next: the Finance Platform** (Revenue Tracker, Payout Engine computing every recipient's share from the v2.0 structure incl. HOG/COO 2.5% and the Core/Sub override, Bucket Manager on the 40% retained share, Founder Draws by revenue tier, financial reports), consuming the constants under "EduCraft Commission Structure".
- [x] Phase 2 — Finance Platform (Sept 2026) — built from `DATA/EDUCRAFT_RBAC/EDUCRAFT_Phase2_Finance_Platform.md`, one build-sequence step at a time, each with a live API run against the dev server (`scripts/tmp/verify-p2-step*.ts`, QA rows created and deleted) and a Chrome DevTools check at 375 and 1440. Every figure has ONE definition, in `src/lib/finance/commission-config.ts` (pure; `npm run check:finance` asserts the spec's maths): workers 40%, ambassador 15% in total (tier rate + Core override), HOG 2.5% on ambassador-driven jobs, COO 2.5% on every job, EduCraft retains the rest (40% of the standard referred job, 57.5% direct) split 37.5/17.5/17.5/27.5 into Operations Reserve / Growth Fund / Reinvestment Fund / Founder Distribution; founder draw tiers; semester surplus; bucket health; `FINANCE_DEFAULTS` (operating cost ₦150K/month, reference revenue ₦1M, HOG budget ₦150K/quarter, approval threshold ₦50K — the first three are editable in Finance settings on the Bucket manager, `services/finance/settings.ts`). Whole naira everywhere except Claude costs. **Revenue Tracker** (`/admin/finance/revenue`, `services/finance/revenue.ts`): every client payment (`Payment.source` PAYSTACK/MANUAL/SYSTEM; statuses Pending/Confirmed/Failed/Rejected/Duplicate; refunds are a REFUND OUTFLOW row and the inflow stays Confirmed, so revenue = confirmed inflows − refunds), filters/sort/paging, an outstanding-balance chase list aged under 7 / 7–14 / over 14 days with WhatsApp reminders, and the finance acts: **verifying is a finance act** — the COO (or anyone) marks a bank transfer paid, which writes a MANUAL Pending row (`markPaymentPaid`) and notifies finance; the founder or CFO confirms it (`verifyPayment` claims exactly that row, never a live Paystack checkout), refuses it (`rejectPayment`, leg back to Unpaid) or records one nobody marked (`recordManualPayment`). A second Paystack charge on a verified leg is held as Duplicate for refund. `POST /api/admin/projects/[id]/verify-payment` is founder + CFO (`canVerifyPayments`); project pages hide Verify from everyone else. **Buckets** (`services/finance/buckets.ts`, `/admin/finance/buckets`): the unit of truth is the PROJECT — `syncProjectBuckets` compares what the buckets should hold (retained share × money in ÷ price) with what is logged (`BucketAllocationLog`, signed) and writes the delta as four `BucketTransaction` rows (balance = Σ per bucket; `BucketBalance` rows are per-month mirrors). Called from every confirmation (verifyPayment, creditProjectPayment, processPendingIntake), allocation changes (`allocateAmbassador`/`removeAllocation`), cancel/refund (`holdProject`), and the backfill, so replays add nothing and a later ambassador allocation trues the buckets up. Cards with health bars (Operations Reserve judged in months of operating cost, the others against their share of the reference month), month flows, the HOG budget, the semester-end surplus analysis (half of Operations Reserve above 3 months of cost + Founder Distribution beyond the monthly draws, capped at what it holds; "Recommend semester bonus" creates two PENDING `FounderDraw` rows), transaction log, manual adjustment. **Payout engine** (`services/finance/payouts-engine.ts`, `/admin/finance/payouts`): a `PayoutRecord` per leg and recipient (WORKER/AMBASSADOR/PARENT/HOG/COO; exec recipientId is the role string, resolved to the earliest active login with that role when paid) produced when a project reaches COMPLETED (`transitionProject`) and reconciled when legs change (`reconcileProjectPayouts`; a leg already paid before the engine is recorded PAID from the project flag); `calculateMonthlyPayouts` re-reconciles a month, idempotent. Marking paid is a claim (PENDING → PAID under a count check) that writes one OUTFLOW Payment per recipient (IDs minted from one read so several in one transaction never collide), flips the legacy project flags (the worker/ambassador portals read those), and notifies. Sections: workers, ambassadors (personal referrals vs Core overrides, paid together), executives, performance bonuses (`PerformanceBonus`, entered by hand beside the metric each is judged on: activation rate, QA first pass, on-time, supervisor rejections), CSV export. The COO opens the same route and sees only "Submit monthly payout list" (`getCooPayoutView`, `submitPayoutList` → `PayoutSubmission`, re-submitting keeps revisions; the CFO sees the submission and whether the engine's figures moved since). The old `services/payouts.ts` / `PayoutQueue` are gone; `GET /api/admin/finance/payouts` (SA/CFO), `coo-view` + `coo-submit` (also COO). **Founder draws** (`services/finance/founder-draws.ts`, `/admin/finance/founder-draws`): the month's draw from its revenue tier, Distribute both / per founder — refused when Founder Distribution cannot fund it (the founder may state a partial amount; the rest later is a MONTHLY_TOPUP); every distribution is a `FounderDraw` + a bucket outflow tied to it. Semester bonus: CFO recommends (Bucket manager) → founder approves (released surplus leaves Operations Reserve, the rest Founder Distribution) or declines; annual profit share the same in December. 12-month history. **Expenses** (`services/expenses.ts`): every expense names its bucket (`bucketSource`; category pre-selects it; Founder Distribution never pays one) and leaves it as an outflow when logged (`syncExpenseOutflow`, one transaction per expense, removed on delete); over ₦50K and not logged by the founder → `PENDING_APPROVAL` (no outflow, founder notified) until the founder approves/declines (`PATCH /expenses/[id]/approve`); kinds MANUAL / COMMISSION (a job's ambassador commission, no bucket — it comes off the 15%) / AI / SPONSORSHIP. The HOG logs sponsorships at `/admin/ambassadors/sponsorship` (`POST /expenses/sponsorship`, Growth Fund, same approval rule, finance notified) against the quarterly budget (`GET /expenses/hog-budget`, counts only sponsorships). **Dashboard** (`services/finance/dashboard.ts`, `/admin/finance`): this month vs last (revenue, payouts owed/paid, net retained, projects), bucket health, Needs attention (each line links to its page), six months of revenue vs payouts; reads run in small batches because the Prisma pool (9 connections locally) times out when a page fires 40 queries at once. **Reports** (`services/finance/reports.ts`, `/admin/finance/reports`): monthly / semester / annual on screen and as .docx (`src/lib/finance/report-docx.ts`, `POST /api/admin/finance/reports/export`); `/admin/reports/finance` redirects there. **Navigation:** `(dashboard)/admin/finance/layout.tsx` renders `FinanceTabs` for the tabs the role may open (the COO gets none); the sidebar's Finance section is "Finance" (SA, CFO) + "Payouts" (SA, COO); `check:rbac` treats a page under a nested entry as offered. **Notifications:** `notifyFinance` (SA + CFO) for payments to verify, refunds, submissions, sponsorships; `notifyRole("COO")` when finance confirms/refuses a marked payment; the founder for approvals and recommendations. **Backfill:** `npm run finance:backfill` (applied once: 4 projects / ₦39,313 retained; 12 AI log rows → 2 expenses / ₦662.74). **Deviations from the spec, on purpose:** allocation is per project and delta-based rather than "40% of each payment" (so reallocations and refunds stay exact); AI costs roll up per project/day rather than one expense per call (the AI usage page keeps the per-call detail); the semester bonus is capped at what Founder Distribution actually holds; the draw tier table is the spec's, but at the tier floors Founder Distribution (11% of revenue) does not fund ₦75K+ draws — the founder sees a shortfall and may draw a partial amount; `parent_commission_rate` no longer sets the Core's cut. Dev-server note: on Windows a page's first render after an on-demand compile sometimes throws "Cannot read properties of null (reading useContext)" in the (ssr) bundle — a reload clears it; production is unaffected.
- [ ] Production deployment
