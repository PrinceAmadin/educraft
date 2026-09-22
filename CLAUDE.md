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

Every Claude call made through `src/lib/anthropic.ts` is logged to `AiUsageLog` (pass `usage: {...}` to attribute it) and shown at `/admin/finance/ai-usage`. Costs convert USD to naira at `USD_NGN_RATE` (env var, default 1500) — change it in Vercel and redeploy, no code edit; the rate is stored per row at log time, so old rows keep theirs. Model prices live in `src/lib/ai-usage-log.ts`. Anthropic has no credit-balance API, so the balance is entered manually (super admin) and HQ subtracts logged spend from it.

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
- [x] Client sign-in (Sept 2026) — `/client/login`: **Client ID + a password the client sets once.** First time (or forgot): the ID requests a 6-digit code emailed ONLY to the email already on the client record (`POST /api/client/otp/request`, no email field, identical response for every ID, code hashed, 10 min, single use, superseded by a newer one, locked after 5 wrong tries, 60 s cooldown, 3 per 15 min, per-IP caps in Postgres), then `POST /api/client/password/set` (code + new password) stores a bcrypt hash and signs them in; afterwards ID + password only (NextAuth provider `client-password`; 10 wrong passwords per account per 15 min locks it). The password is never emailed. One `User` (role CLIENT) per email, linked to every `Client` row sharing it, so one login shows all their projects; an email that belongs to an admin/worker/ambassador user can never be a client login. Email is now required at intake; admins fix/add it on `/admin/clients/[id]` (`PATCH /api/admin/clients/[id]/email`; changing it unlinks the old login). `/client` is a placeholder for the real dashboard: use `getClientScope()`/`requireClient()` from `src/lib/api.ts` and filter every query by `scope.clientIds`. Core in `src/lib/services/client-otp.ts`. Gmail SMTP (~500/day) is the ceiling for codes at scale: swap the provider inside `sendMail`.
- [x] One login for worker + ambassador (Sept 2026) — a person is identified by the email on their `Worker`/`Ambassador` record, not by role; one `User` can own both profiles (schema always allowed it). `/login/set-password` (linked from `/login`, also the forgot-password page for both) takes an email or EC-A-/EC-W- ID, emails a 6-digit code ONLY to the address on record (same safety rules as client sign-in, `PortalLoginCode` keyed by email, `src/lib/services/portal-otp.ts`, `/api/portal/otp/request` + `/api/portal/password/set`), then sets the password of the ONE login the person's profiles already sit on (found from the profiles carrying that email, so a stale same-email login cannot block it; the code only ever sets the password of a login whose OWN email is the inbox it was sent to, so a record whose email differs from its linked login's email is refused and an admin must align them; the reply names the email to sign in with and `/login` prefills it), creating a login if there is none and attaching any unlinked profile. A profile already on another login is never moved; staff/client emails, suspended logins and pending applicants are refused; an inactive leftover login from a rejected application with nothing attached is reactivated and reused. Every refusal is silent to the caller (same answer) but logged server-side as `[portal-otp] no code sent: <reason>` / `[client-otp] no code sent: …` in Vercel runtime logs: check there first when someone says no code arrived. Which portals a login has is read from the database on every dashboard load (`portalsForUser` in `src/lib/auth.ts`, used by `(dashboard)/layout.tsx`), never from the JWT, so linking or approving a second role shows up without signing in again. `middleware.ts` lets WORKER/AMBASSADOR logins into either root (the edge cannot query the DB); `worker/layout.tsx` and `ambassador/layout.tsx` call `requirePortalProfile` (`src/lib/portal-access-guard.ts`) which requires that profile in good standing (worker Active/On Break, ambassador Active), and `requireWorker`/`requireAmbassador` do the same for APIs. `DashboardShell` picks the sidebar/nav from the URL with a "Switch to … dashboard" item in the account menu. Suspending or deleting a worker no longer closes a login that still has an active ambassador profile (`hasActiveAmbassador` in `workers.ts`). Admin detail pages show an "Also an ambassador / Also a worker" link (`LinkedProfileLink`, `linked-profiles.ts`); the two list pages do not. **Applying for the other role:** a worker applying at `/apply`, or an ambassador at `/apply/worker`, with the email of their active login: the API answers 409 `code: VERIFY_EMAIL` and emails a code (`findLoginForApplication`/`sendApplicationCode`/`verifyApplicationCode` in `portal-otp.ts`); the form then asks for it (`emailCode`), the application attaches to the existing `User` (no new login, password untouched), and approval adds the profile to that login.
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
- [x] Gmail alerts + applicant decision emails (Sept 2026) — the team's Gmail is emailed when an ambassador applies (`submitApplication`), a worker applies (`submitWorkerApplication`), and a client's downpayment is confirmed by Paystack on an order (pay-first `processPendingIntake`, and variable-price orders paid later in `creditProjectPayment`). Not sent for a downpayment an admin verifies by hand, or for pro bono. Recipients: Settings > General > **Email alerts** (`alert_emails` Setting, comma-separated, Super Admin only: the settings route drops the field for OPS_MANAGER), default `amadinprince26@gmail.com` (`getAlertEmails` in `services/settings.ts`). Keep the list off `educraft611@gmail.com`: that account sends them, and Gmail files mail it sends to itself under Sent. Code: `src/lib/services/team-alerts.ts` (builds from the DB row, sends via `waitUntil` after the response, queued straight after the commit, logs `[team-alert] … sent to N inbox(es)` / `not sent: …` in Vercel logs; application alerts stop past 20 applications an hour so a flood can't use up the Gmail quota that client sign-in codes share) and templates in `src/lib/emails/team-alerts.ts`. A paid order whose project wasn't advanced (cancelled/on hold mid-checkout) is flagged "Decision needed"; a pay-first payment that could not become a project (`IntakeError`) raises an urgent in-app notification plus an "Action needed" email. **Applicants hear only the decision** (founder's call: nothing at submission): approved ambassador = existing `ambassadorWelcomeEmail` (button now `/ambassador`), approved worker = `workerApprovedEmail` (worker ID, button `/worker`), rejected ambassador/worker = `applicationRejectedEmail`; the admin's rejection note is internal and never quoted (`src/lib/emails/application-decision.ts`). Tested end to end in Chrome with a local Paystack stand-in (the commented test key in `.env.local` is no longer valid: Paystack answers "Invalid key").
- [ ] Production deployment
