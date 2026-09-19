# Traqly — Master AI Build Prompt (v3)
### Copy this entire document and paste it into your AI coding assistant (Claude Code, Cursor, GPT-4o, etc.)

---

## ROLE & MISSION

You are a **senior full-stack engineer AND a senior product designer** working together in one role. Your job is to build **Traqly** — a production-grade link tracking and analytics platform built specifically for small and medium-scale business owners (SMBs) in Africa and beyond.

This is not a demo. Build it as if it is going live to real paying users on Product Hunt tomorrow. Every feature must be fully functional, tested, and polished. Do not use placeholder data, mock APIs, or "coming soon" screens unless explicitly told to. Write real code, real database schemas, real business logic.

**On the UI specifically:** You are NOT allowed to generate generic AI-looking layouts, basic shadcn copy-paste screens, flat white box dashboards, repetitive card grids, or template admin panels. Every screen you build must look like it came from a senior product designer at a YC-backed startup. Think Linear, Vercel, Stripe, Dub.co, Resend, PostHog, and Attio. Before writing a single line of UI code, think like a designer first. Then execute like an engineer.

---

## ⚠️ UI QUALITY MANDATE — READ BEFORE WRITING ANY CODE

This section applies to EVERY component, EVERY page, and EVERY interaction across the entire application. It is non-negotiable.

### What Traqly Must Look Like

The UI must be comparable in quality and polish to:
- **Linear** — for its information density and motion design
- **Stripe Dashboard** — for its data tables, typography, and trust signals
- **Vercel** — for its dark aesthetic and status indicators
- **Notion** — for its whitespace discipline and readable layouts
- **Raycast** — for its command-driven, keyboard-first feel
- **Framer** — for its animation quality and visual polish
- **Dub.co** — for its link analytics visual design (direct competitor reference)
- **PostHog** — for its data-rich but clean analytics approach
- **Resend** — for its minimal yet premium developer aesthetic
- **Attio** — for its modern CRM data density and color usage
- **Superhuman** — for its micro-interaction quality and speed feel
- **Arc Browser** — for its UI personality and brand character

### What Traqly Must NEVER Look Like

Do not generate:
- Generic Tailwind block layouts
- "AI-generated dashboard" screens
- Template admin panels
- Repetitive same-size card grids
- Oversized padding and empty whitespace
- Random color usage without a system
- Basic shadcn copy-paste without customization
- Flat white box UIs
- Beginner SaaS clone aesthetics
- The typical ChatGPT/Claude-generated UI look

If you are about to write a component that could have come from any random Tailwind tutorial, stop and redesign it.

### The Design Philosophy

Traqly is NOT just a dashboard. It is:
- A **growth intelligence platform**
- An **analytics command center**
- A **real-time performance monitoring system**
- A **dopamine-driven productivity tool for entrepreneurs**

The UI should make users feel:
- **Productive** — every action is fast and intentional
- **Powerful** — they are in command of their data
- **Informed** — they can read their performance at a glance
- **Excited** — they want to open the app and check their stats
- **In control** — the interface communicates clarity and confidence

The experience should feel **alive**. Numbers should count up. Charts should animate in. Real-time updates should pulse. The interface should feel like it is breathing.

---

---

## PRODUCT OVERVIEW

**Traqly** solves a core problem for SMB owners: they share links to drive customers to their WhatsApp, product pages, or landing pages — but have zero visibility into what is working. They post on Instagram, Facebook, WhatsApp Status, and through other people, but they can never answer: "Which post drove the most clicks? Which platform works best? Is this campaign actually working?"

Traqly gives them:
1. A way to generate trackable short links (or wrap existing links)
2. A real-time dashboard showing click performance
3. Deep analytics: who clicked, from where, on what device, from which platform
4. Fraud and bot protection so the data is trustworthy
5. Leaderboards, streaks, and achievements to make monitoring feel rewarding
6. A notification and monitoring system so they always know what's happening
7. **Mutable/Live Links** — the ability to update a link's destination URL at any time without changing the slug
8. **Smart Routing** — geo and device-based redirect rules on a per-link basis
9. **Retargeting Pixels** — attach Meta, Google, or TikTok pixels to any link
10. **Link-in-Bio Page Builder** — a branded multi-link landing page for social media bios

**Target user**: A Nigerian or African entrepreneur running 1–3 businesses, sharing links via WhatsApp, Instagram, Facebook, and TikTok, and making business decisions based on what's getting attention.

---

## TECH STACK

Use this exact stack unless a component is unavailable:

### Frontend
- **Framework**: Next.js 14+ (App Router)
- **Styling**: Tailwind CSS + shadcn/ui components (heavily customized — do NOT use default shadcn styles as-is)
- **Charts**: Recharts (with custom theming — gradient fills, animated transitions, custom tooltips, no default colors)
- **Real-time**: Socket.io client (or Server-Sent Events)
- **State**: Zustand for global state, React Query (TanStack) for server state
- **Icons**: Lucide React
- **Animations**: Framer Motion — used on EVERY page, EVERY interactive element, EVERY transition
- **PWA**: next-pwa for installability on mobile
- **Fonts**: Geist (primary, via `next/font/google` or the `geist` npm package) + Inter as fallback. Configure globally in `src/app/layout.tsx`.
- **Number animations**: `react-countup` — all stat counters must animate on mount and update
- **Date utilities**: `date-fns` for all date formatting and manipulation

### Backend
- **Runtime**: Node.js with Next.js API Routes (or separate Express/Fastify server)
- **ORM**: Prisma
- **Job Queue**: BullMQ + Redis (for async click processing)
- **Rate Limiting**: Redis via `ioredis`
- **Authentication**: NextAuth.js (email/password + Google OAuth)
- **Email**: Resend (transactional email)

### Database
- **Primary DB**: PostgreSQL (user accounts, links, campaigns, aggregations)
- **Analytics DB**: Use PostgreSQL with TimescaleDB extension for time-series click events, OR a separate ClickHouse instance if available. If neither is available, use a dedicated `click_events` table in PostgreSQL with proper indexing on `(link_id, created_at)`.
- **Cache / Rate Limit**: Redis (Upstash Redis for serverless, or self-hosted)

### Infrastructure
- **Hosting**: Vercel (frontend + API routes) or Railway (full-stack)
- **File Storage**: Cloudflare R2 or AWS S3 (for PDF exports, archived data)
- **Payments**: Paystack (primary, for African users) + Stripe (international)
- **Geo IP**: MaxMind GeoLite2 (self-hosted, free) or ip-api.com
- **Browser Fingerprinting**: @fingerprintjs/fingerprintjs (open source)
- **Short URL Generation**: nanoid (for generating slugs)

---

## DATABASE SCHEMA

Design and implement ALL of the following tables. Use Prisma schema format.

```prisma
// Users
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String?
  password      String?  // hashed with bcrypt
  image         String?
  plan          Plan     @default(FREE)
  referralCode  String   @unique @default(cuid())
  referredBy    String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  workspaces    WorkspaceMember[]
  sessions      Session[]
}

// Workspaces (one user can have multiple businesses)
model Workspace {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  logo        String?
  ownerId     String
  createdAt   DateTime @default(now())
  members     WorkspaceMember[]
  links       Link[]
  campaigns   Campaign[]
  bioPages    BioPage[]
}

model WorkspaceMember {
  id          String    @id @default(cuid())
  userId      String
  workspaceId String
  role        Role      @default(VIEWER)
  user        User      @relation(fields: [userId], references: [id])
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  @@unique([userId, workspaceId])
}

// Links
model Link {
  id                  String    @id @default(cuid())
  workspaceId         String
  campaignId          String?
  originalUrl         String    // current destination URL (mutable)
  slug                String    @unique  // the short code — NEVER changes
  title               String?
  description         String?
  tags                String[]
  isActive            Boolean   @default(true)
  expiresAt           DateTime?
  clickGoal           Int?      // target clicks
  password            String?   // bcrypt-hashed password for protected links
  isPasswordProtected Boolean   @default(false)
  customOgTitle       String?   // for social preview customization
  customOgDescription String?
  customOgImage       String?   // URL to a stored image
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  workspace           Workspace @relation(fields: [workspaceId], references: [id])
  campaign            Campaign? @relation(fields: [campaignId], references: [id])
  clicks              ClickEvent[]
  dailyStats          DailyStat[]
  weeklyStats         WeeklyStat[]
  monthlyStat         MonthlyStat[]
  yearlyStat          YearlyStat[]
  abVariants          ABVariant[]
  destinationHistory  LinkDestinationHistory[]
  smartRoutingRules   SmartRoutingRule[]
  pixelIntegrations   PixelIntegration[]
  rotatorEntries      LinkRotatorEntry[]
}

// ─── NEW: Destination history (Mutable/Live Links) ───────────────────────────
// Every time a link's destination URL is changed, log it here.
// This lets users audit who changed what and when, and lets the analytics
// UI annotate the click chart with "destination changed" markers.
model LinkDestinationHistory {
  id            String   @id @default(cuid())
  linkId        String
  previousUrl   String
  newUrl        String
  changedByUserId String
  changedAt     DateTime @default(now())
  note          String?  // optional "reason for change" field
  link          Link     @relation(fields: [linkId], references: [id])
  @@index([linkId, changedAt])
}

// ─── NEW: Smart Routing Rules ────────────────────────────────────────────────
// Each rule specifies conditions under which a click is redirected to a
// different destination URL instead of the link's default originalUrl.
// Rules are evaluated in priority order (lowest number = checked first).
// If no rule matches, fall back to originalUrl.
model SmartRoutingRule {
  id          String           @id @default(cuid())
  linkId      String
  priority    Int              @default(0)
  ruleType    SmartRuleType    // GEO | DEVICE | OS | LANGUAGE | TIME_OF_DAY | DAY_OF_WEEK
  matchValue  String           // e.g. "NG" for GEO, "mobile" for DEVICE, "09:00-17:00" for TIME_OF_DAY
  destination String           // the URL to redirect to when rule matches
  isActive    Boolean          @default(true)
  createdAt   DateTime         @default(now())
  link        Link             @relation(fields: [linkId], references: [id])
  @@index([linkId, priority])
}

enum SmartRuleType { GEO DEVICE OS LANGUAGE TIME_OF_DAY DAY_OF_WEEK }

// ─── NEW: Retargeting Pixel Integrations ─────────────────────────────────────
model PixelIntegration {
  id        String    @id @default(cuid())
  linkId    String
  pixelType PixelType // META | GOOGLE_ADS | TIKTOK | CUSTOM
  pixelId   String    // the platform's pixel/tag ID
  isActive  Boolean   @default(true)
  createdAt DateTime  @default(now())
  link      Link      @relation(fields: [linkId], references: [id])
}

enum PixelType { META GOOGLE_ADS TIKTOK CUSTOM }

// ─── NEW: Link Rotator Entries ────────────────────────────────────────────────
// When a link has rotator entries, traffic is split across them.
// weight: relative weight for weighted distribution (default equal weight).
model LinkRotatorEntry {
  id          String   @id @default(cuid())
  linkId      String
  destination String
  weight      Int      @default(1)
  clickCount  Int      @default(0) // running tally for round-robin tracking
  label       String?  // e.g. "Variant A" or "Worker 1 Profile"
  isActive    Boolean  @default(true)
  link        Link     @relation(fields: [linkId], references: [id])
}

// ─── NEW: Bio Page Builder ────────────────────────────────────────────────────
model BioPage {
  id              String        @id @default(cuid())
  workspaceId     String
  slug            String        @unique  // accessible at /bio/[slug]
  displayName     String
  bio             String?
  avatarUrl       String?
  backgroundColor String?       @default("#ffffff")
  buttonColor     String?       @default("#000000")
  buttonTextColor String?       @default("#ffffff")
  isPublished     Boolean       @default(false)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  workspace       Workspace     @relation(fields: [workspaceId], references: [id])
  links           BioPageLink[]
}

model BioPageLink {
  id         String   @id @default(cuid())
  bioPageId  String
  title      String
  url        String   // can be a Traqly short link (for tracking) or raw URL
  position   Int      // display order
  isActive   Boolean  @default(true)
  clickCount Int      @default(0)
  icon       String?  // optional emoji or icon name
  createdAt  DateTime @default(now())
  bioPage    BioPage  @relation(fields: [bioPageId], references: [id])
  @@index([bioPageId, position])
}

// Raw click events (the source of truth — NEVER delete these)
model ClickEvent {
  id              String      @id @default(cuid())
  linkId          String
  timestamp       DateTime    @default(now())
  ipHash          String      // SHA-256 of IP — never store raw IP
  fingerprint     String?     // browser fingerprint hash
  country         String?
  city            String?
  region          String?
  device          String?     // mobile | desktop | tablet
  os              String?
  browser         String?
  referrer        String?     // raw referrer URL
  referrerSource  String?     // instagram | facebook | whatsapp | twitter | tiktok | direct | other
  quality         ClickQuality @default(UNIQUE)
  isFraud         Boolean     @default(false)
  fraudReason     String?
  sessionId       String?
  // Capture which destination was active at time of click (for mutable link accuracy)
  resolvedUrl     String?
  link            Link        @relation(fields: [linkId], references: [id])
  @@index([linkId, timestamp])
  @@index([timestamp])
  @@index([ipHash])
}

// Aggregated daily stats (computed from ClickEvent, updated every minute by cron)
model DailyStat {
  id              String   @id @default(cuid())
  linkId          String
  date            DateTime // truncated to start of day (UTC)
  totalClicks     Int      @default(0)
  uniqueClicks    Int      @default(0)
  duplicateClicks Int      @default(0)
  botClicks       Int      @default(0)
  link            Link     @relation(fields: [linkId], references: [id])
  @@unique([linkId, date])
}

// Weekly stats (computed after day 7)
model WeeklyStat {
  id              String   @id @default(cuid())
  linkId          String
  weekStart       DateTime
  totalClicks     Int      @default(0)
  uniqueClicks    Int      @default(0)
  link            Link     @relation(fields: [linkId], references: [id])
  @@unique([linkId, weekStart])
}

// Monthly stats
model MonthlyStat {
  id              String   @id @default(cuid())
  linkId          String
  monthStart      DateTime
  totalClicks     Int      @default(0)
  uniqueClicks    Int      @default(0)
  link            Link     @relation(fields: [linkId], references: [id])
  @@unique([linkId, monthStart])
}

// Yearly stats
model YearlyStat {
  id              String   @id @default(cuid())
  linkId          String
  year            Int
  totalClicks     Int      @default(0)
  uniqueClicks    Int      @default(0)
  link            Link     @relation(fields: [linkId], references: [id])
  @@unique([linkId, year])
}

// Campaigns
model Campaign {
  id          String    @id @default(cuid())
  workspaceId String
  name        String
  description String?
  goal        Int?      // total click target
  startDate   DateTime?
  endDate     DateTime?
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  links       Link[]
}

// A/B Test Variants
model ABVariant {
  id        String   @id @default(cuid())
  linkId    String
  name      String   // e.g. "Version A - Instagram Caption"
  url       String
  slug      String   @unique
  clicks    Int      @default(0)
  link      Link     @relation(fields: [linkId], references: [id])
}

// Notifications
model Notification {
  id          String           @id @default(cuid())
  userId      String
  workspaceId String?
  type        NotificationType
  title       String
  body        String
  isRead      Boolean          @default(false)
  linkId      String?
  createdAt   DateTime         @default(now())
}

// Streaks
model Streak {
  id            String   @id @default(cuid())
  linkId        String   @unique
  currentStreak Int      @default(0)
  longestStreak Int      @default(0)
  lastActiveDay DateTime?
  updatedAt     DateTime @updatedAt
}

// User Achievements
model Achievement {
  id          String   @id @default(cuid())
  userId      String
  workspaceId String
  type        String   // FIRST_100, WEEKLY_WARRIOR, HAT_TRICK, etc.
  linkId      String?
  earnedAt    DateTime @default(now())
}

// Goals
model Goal {
  id          String     @id @default(cuid())
  linkId      String?
  campaignId  String?
  workspaceId String
  type        GoalType   // DAILY | WEEKLY | MONTHLY
  target      Int
  period      DateTime   // which day/week/month this goal is for
  achieved    Boolean    @default(false)
  achievedAt  DateTime?
  createdAt   DateTime   @default(now())
}

// Subscription/Plan
model Subscription {
  id              String   @id @default(cuid())
  userId          String   @unique
  plan            Plan
  status          String   // active | cancelled | past_due
  paystackRef     String?
  stripeSubId     String?
  currentPeriodEnd DateTime
  createdAt       DateTime @default(now())
}

enum Plan { FREE GROWTH BUSINESS }
enum Role { ADMIN EDITOR VIEWER }
enum ClickQuality { UNIQUE RETURN DUPLICATE BOT }
enum NotificationType { MILESTONE FRAUD_ALERT GOAL_REACHED STREAK DAILY_DIGEST SPIKE_DETECTED GOAL_REMINDER WEEKLY_REPORT LINK_EXPIRED DESTINATION_CHANGED ACHIEVEMENT }
enum GoalType { DAILY WEEKLY MONTHLY }
```

---

## CORE FEATURES TO BUILD (COMPLETE LIST)

Build every feature listed. Do not skip any.

---

### FEATURE 1 — AUTHENTICATION

- Email + password registration (bcrypt hashing)
- Google OAuth via NextAuth.js
- Email verification on signup (send via Resend)
- Password reset flow (email token, 1-hour expiry)
- "Remember me" session persistence
- Referral code capture at signup (store `referredBy` on User)
- Protect all dashboard routes with auth middleware

---

### FEATURE 2 — WORKSPACE MANAGEMENT

- On first login, auto-create a default workspace named after user's business
- User can create additional workspaces (max: 1 on Free, 3 on Growth, unlimited on Business)
- Workspace switcher in the sidebar/nav — instant switch with no full page reload
- Workspace settings: name, logo upload, slug
- Invite team members by email — send invite link
- Role-based access: Admin (full access), Editor (manage links/campaigns), Viewer (read-only analytics)
- Workspace deletion (with confirmation, 30-day grace period before purge)

---

### FEATURE 3 — LINK MANAGEMENT

**Creating a link:**
- User pastes any URL → system wraps it in a trackable short link
- Auto-generate a slug using nanoid (6 characters, alphanumeric)
- Allow custom slug (check uniqueness, allow only alphanumeric + hyphens)
- Optional: add a title, description, tags (multi-select), and campaign assignment
- Set an expiry date (link stops redirecting after this date, shows "expired" page)
- Set a click goal for that link

**Link list view:**
- Table or card grid of all links in the workspace
- Columns: Title | Short URL | Destination | Today's clicks | Total clicks | Quality score | Status | Created
- Filter by: campaign, tag, status (active/paused/expired), date range
- Sort by: clicks today, total clicks, created date
- Search by title or URL
- Bulk actions: pause, archive, delete, add to campaign

**Per-link detail page:**
- Full analytics breakdown (see Feature 6)
- QR code displayed (downloadable as PNG)
- 1-click copy of short URL
- Share options: WhatsApp, Instagram caption, Twitter/X, TikTok
- Platform caption templates (pre-written shareable text)
- Edit link settings
- View click audit log

**Link actions:**
- Pause link (stops counting clicks but keeps redirecting)
- Archive link (hidden from main list, stats preserved)
- Duplicate link (creates copy with new slug)
- Delete link (soft delete — data retained for 30 days)

---

### FEATURE 4 — CLICK TRACKING ENGINE

This is the most critical and most performance-sensitive part of the system. Build it correctly.

**Redirect endpoint**: `GET /r/[slug]`
- Resolve slug → original URL from cache (Redis) first, then DB
- If link is expired: redirect to a branded "This link has expired" page
- If link is paused: still redirect, but mark click as `paused=true`, do not count
- If link is password-protected: redirect to `/r/[slug]/auth` instead
- Evaluate smart routing rules in priority order before redirecting — if a rule matches, redirect to that rule's destination instead of `originalUrl`
- If a link has rotator entries (Feature 22), select the next destination using the configured strategy (round-robin or weighted)
- Immediately 302 redirect to destination URL — do not make the user wait
- After redirect, fire an async job to process the click event (BullMQ queue)
- Store `resolvedUrl` in the click event (the actual URL the user was sent to)

**Async click processor (BullMQ worker)**:
The worker receives the raw click data and performs:

1. **Rate limit check**: Has this IP hash clicked this link more than 3 times in the last hour? If yes, classify as `DUPLICATE` (still log, do not count as unique).
2. **IP Geo lookup**: Use MaxMind GeoLite2 to resolve country, city, region.
3. **Device/OS/Browser parsing**: Parse the User-Agent string.
4. **Referrer classification**: Parse the `Referer` header:
   - Contains `instagram.com` → `instagram`
   - Contains `facebook.com` or `fb.com` → `facebook`
   - Contains `wa.me`, `whatsapp.com` → `whatsapp`
   - Contains `twitter.com` or `t.co` → `twitter`
   - Contains `tiktok.com` → `tiktok`
   - Contains `linkedin.com` → `linkedin`
   - Empty / direct → `direct`
   - Everything else → `other`
5. **Bot detection**:
   - Check UA against known bot list (Googlebot, bingbot, curl, wget, python-requests, etc.)
   - Check for missing headers that real browsers always send
   - Check velocity: more than 10 clicks per minute from same IP hash → `BOT`
   - If fingerprint score is available and below threshold → `BOT`
6. **Click quality assignment**:
   - First click from this fingerprint on this link → `UNIQUE`
   - Same fingerprint, different session (>30 min gap) → `RETURN`
   - Same fingerprint, <30 min since last click → `DUPLICATE`
   - Bot signals detected → `BOT`
7. **Write to DB**: Insert `ClickEvent` record with all enriched fields, including `resolvedUrl`.
8. **Update Redis counter**: Increment real-time counter for this link's today count.
9. **Streak update**: Check if today is a new day for this link, update `Streak` record.
10. **Notification check**: Has this link crossed a milestone (100, 500, 1000, 5000, 10000 clicks)? Fire notification if yes.
11. **Goal check**: Is this click pushing the link past its daily/weekly goal? Fire notification if yes.
12. **Spike detection**: Is the click rate in the last 10 minutes 3× higher than the average rate for this link? Fire spike alert notification.

---

### FEATURE 5 — DATA AGGREGATION SYSTEM

Run the following cron jobs using BullMQ's repeatable job functionality:

**Every 1 minute:**
- For each active link: count clicks from `ClickEvent` for today (UTC) grouped by quality, upsert into `DailyStat`

**Every night at 00:05 UTC (daily rollup):**
- Finalize yesterday's `DailyStat` for all links
- Update `Streak` for each link based on whether yesterday had ≥1 unique click
- Check and award any daily achievements

**Every Monday at 00:10 UTC (weekly rollup):**
- For each link: sum last 7 days of `DailyStat` into a `WeeklyStat` record
- Update weekly leaderboard rankings
- Send weekly digest email to all users who have the setting enabled

**1st of each month at 00:15 UTC (monthly rollup):**
- Sum last 4–5 weeks of `WeeklyStat` into `MonthlyStat`

**1st January each year (yearly rollup):**
- Sum all monthly stats for the past year into `YearlyStat`

**Data Hierarchy Display Logic:**
- Days 1–7: Show individual daily bars (7-day view)
- After day 7: Collapse into weekly bars (up to 12 weeks)
- After 12 weeks: Collapse into monthly bars (up to 12 months)
- After 12 months: Collapse into yearly bars (up to 5 years)
- After 5 years: Data is marked as archived but never deleted. Still queryable.

---

### FEATURE 6 — ANALYTICS DASHBOARD

**Main dashboard (workspace level):**
- Total clicks today (workspace-wide, real-time counter)
- Today vs yesterday comparison (green/red %)
- Total unique clicks this week
- Top performing link today (with click count)
- Active links count
- Fraud blocked today (bot + duplicate count)
- Quick leaderboard preview (top 3 links today)
- Activity feed: last 10 click events (real-time, via WebSocket)
- "Best time to post" widget (based on historical hourly data)

**Per-link analytics page:**
Tabs: Overview | Traffic Sources | Geography | Devices | Quality | History | Raw Log

*Overview tab:*
- Real-time click counter for today
- Click trend chart (daily bars, auto-scaling based on data age — see hierarchy above)
- **Destination change markers**: If the link's destination URL was changed, display a vertical dashed line annotation on the chart at the exact date of each change. Tooltip shows: "Destination changed on [date] by [user]" and the new URL.
- Today vs yesterday vs last week same day
- Streak display (current streak, longest streak)
- Goal progress ring (if goal is set)

*Traffic Sources tab:*
- Donut chart: percentage breakdown by referrer source (Instagram, Facebook, WhatsApp, Twitter, TikTok, Direct, Other)
- Bar chart: clicks per source per day (last 7 days)
- "Top source today" badge

*Geography tab:*
- World map heatmap (colour intensity by click volume) using react-simple-maps or similar
- Top 10 countries table (country flag, name, click count, %)
- Top 10 cities table

*Devices tab:*
- Mobile vs Desktop vs Tablet donut chart
- OS breakdown bar (Android, iOS, Windows, macOS, Linux, Other)
- Browser breakdown bar (Chrome, Safari, Firefox, Samsung Internet, Other)

*Quality tab:*
- Unique / Return / Duplicate / Bot breakdown with colour-coded donut chart
- Data integrity score: `(uniqueClicks / totalClicks) * 100` displayed as a percentage with a label ("Excellent", "Good", "Suspicious", "Poor")
- Fraud events table: timestamp, IP country, device, reason flagged

*History tab (new):*
- Chronological list of all destination URL changes for this link
- Each row: date, previous URL, new URL, changed by (user name), optional note
- "No changes yet — this link's destination has never been updated" if history is empty

*Raw log tab:*
- Paginated table of all ClickEvents for this link
- Columns: Time | Country | City | Device | OS | Browser | Source | Quality | Fraud? | Resolved URL
- Filter by quality, date range, country, source
- Export this table as CSV

---

### FEATURE 7 — LEADERBOARDS

Build three leaderboard views, accessible from the main dashboard sidebar.

**Daily Leaderboard:**
- Shows all active links in the workspace ranked by unique clicks today
- Refreshes every 60 seconds (poll or WebSocket push)
- Shows rank number, link title, click count, trend arrow (up/down from yesterday's rank)
- Crown icon on rank #1
- Rank badge overlaid on each link card in the main link list

**Weekly Leaderboard:**
- Ranked by unique clicks in the current Mon–Sun week
- Shows week-over-week rank change
- "This week's MVP link" highlight at the top with badge

**All-Time Leaderboard:**
- Ranked by total unique clicks since creation
- "Legend" badge for links with 10,000+ all-time clicks
- Includes archived links (they retain their all-time rank)

**Community Leaderboard (opt-in only):**
- Users who opt in appear on a global leaderboard ranked by their workspace's total clicks this week
- Shown anonymously as "Business #1234" unless user sets a public display name
- Separate tab in the leaderboard page

---

### FEATURE 8 — STREAK & ACHIEVEMENT SYSTEM

**Streaks:**
- A streak increments each day a link receives at least 1 unique click
- Missing a day resets the streak to 0 (with one "streak protection" use per month that skips the reset)
- Display on link card: flame icon + streak count ("🔥 7-day streak")
- Show current streak and longest-ever streak on per-link analytics page
- Streak leaderboard within the workspace (which link has the longest active streak)

**Achievement badges (award once each, stored in `Achievement` table):**
| Badge ID | Name | Trigger |
|---|---|---|
| `FIRST_CLICK` | First Step | Link's first ever click |
| `FIRST_100` | First Century | 100 total unique clicks |
| `FIRST_1000` | Four Figures | 1,000 total unique clicks |
| `FIRST_10K` | Legend | 10,000 total unique clicks |
| `WEEKLY_WARRIOR` | Weekly Warrior | 1,000 unique clicks in any 7-day period |
| `HAT_TRICK` | Hat Trick | Top performer 3 weeks in a row |
| `IRON_LINK` | Iron Link | Link active and receiving clicks for 30 consecutive days |
| `GLOBAL_REACH` | Global Reach | Clicks from 5 or more different countries |
| `EARLY_BIRD` | Early Bird | 50%+ of clicks between 6am–9am local time over 7 days |
| `NIGHT_OWL` | Night Owl | 50%+ of clicks between 10pm–1am local time over 7 days |
| `CLEAN_TRAFFIC` | Clean Data | Data integrity score above 95% for 14 consecutive days |
| `LIVE_LINK_PRO` | Live Link Pro | Updated a link's destination 5+ times without breaking its streak |

- Badge earned: show a toast notification + push in-app notification + optional email
- Display all earned badges on the workspace profile page and per-link detail
- Badges are shareable as image cards (generate a PNG with link title, badge name, icon)

---

### FEATURE 9 — GOAL SYSTEM

- Set a goal per link or per campaign
- Goal types: Daily, Weekly, Monthly (total unique click targets)
- Progress tracked in real-time
- Progress ring on link card and detail page (shows % completion)
- Notification at 50%, 75%, 100% reached
- Goal history: list of all goals, which were hit, which were missed
- "Suggested next goal" auto-calculated as 20% above last goal
- If a daily goal is not met by 8pm local time, send a reminder notification: "You're at X clicks — your goal is Y. You have a few hours left."

---

### FEATURE 10 — CAMPAIGN MANAGER

- Create a campaign: name, description, start date, end date, click goal
- Assign one or multiple links to a campaign
- Campaign overview: combined clicks across all links, per-link breakdown, total unique, total bot blocked
- Campaign progress bar: total clicks vs campaign goal
- Compare campaigns: side-by-side chart comparing two campaigns' daily performance
- Campaign status: Draft | Active | Paused | Completed | Archived
- Auto-mark as "Completed" when end date passes

---

### FEATURE 11 — NOTIFICATION & MONITORING SYSTEM

This is a **critical** feature. The system must actively monitor performance and communicate with users — they should never have to check manually to know something important happened.

**In-app notification centre:**
- Bell icon in the nav bar with unread count badge
- Dropdown showing last 20 notifications with title, body, timestamp, and a link to relevant page
- Mark as read individually or "mark all as read"
- Notification types and their triggers:

| Type | Trigger | Example message |
|---|---|---|
| `MILESTONE` | Link hits 100, 500, 1K, 5K, 10K, 50K clicks | "🎉 Your link 'Sallah Promo' just hit 1,000 unique clicks!" |
| `FRAUD_ALERT` | Bot clicks exceed 20% of today's traffic for any link | "⚠️ Suspicious traffic detected on 'WhatsApp Bio Link' — 47 bot clicks blocked today" |
| `SPIKE_DETECTED` | Click rate is 3× above 7-day average in last 15 minutes | "📈 Traffic spike! 'IG Story Link' is getting 5× more clicks than usual right now" |
| `GOAL_REACHED` | Link or campaign hits its click goal | "✅ Goal smashed! 'Week 3 Campaign' hit its target of 500 clicks" |
| `GOAL_REMINDER` | Link at <70% of daily goal at 8pm local time | "⏰ 'Product Launch Link' is at 62 clicks — you're 38 short of today's goal of 100" |
| `STREAK` | Link hits a streak milestone (7, 14, 30, 60, 100 days) | "🔥 30-day streak! 'Bio Link' has received clicks every day for 30 days straight" |
| `ACHIEVEMENT` | Any achievement badge is earned | "🏆 Achievement unlocked: Global Reach — clicks from 5 countries!" |
| `DAILY_DIGEST` | Every morning at 8am local time | "Yesterday summary: 347 clicks across 4 links. Top link: 'IG Promo' (201 clicks)" |
| `WEEKLY_REPORT` | Every Monday morning | "Your weekly report is ready — week of June 2. Total: 2,451 clicks. Best day: Saturday." |
| `LINK_EXPIRED` | A link with an expiry date just expired | "Your link 'Flash Sale June 20' has expired and is no longer redirecting." |
| `DESTINATION_CHANGED` | Any team member updates a link's destination URL | "🔁 'MyWorker01' destination was updated by [Editor Name] to a new URL." |

**Email notifications:**
- Send via Resend
- User can configure which notification types trigger emails in Settings > Notifications
- Daily digest email (optional, on by default)
- Weekly report email (optional, on by default) — include a summary table and a link to the full dashboard
- Beautifully designed HTML email templates using React Email

**Real-time notifications (WebSocket):**
- When a milestone is hit, push immediately to any open dashboard session
- When a spike is detected, push immediately with a banner alert in the dashboard
- Use Socket.io or Ably for real-time push

**System Health Monitoring (admin-visible):**
Build a `/admin/system` page (accessible only to the platform superadmin) showing:
- BullMQ queue depth (how many click events are pending processing)
- Queue processing speed (events/minute)
- Redis memory usage and key count
- DB connection pool status
- API response time (P50, P95, P99 for the `/r/[slug]` redirect endpoint)
- Error rate (500s in last hour)
- Failed jobs in the click processing queue (with retry option)
- Recent cron job execution logs (daily rollup, weekly rollup timestamps)
- Alert thresholds:
  - Queue depth > 10,000 → send alert email to platform admin
  - Error rate > 2% → send alert email to platform admin
  - Redis memory > 80% → send alert
  - Any cron job fails to run → send alert
- This page auto-refreshes every 30 seconds

---

### FEATURE 12 — A/B TESTING

- On any link, create an "experiment" with 2 variants (A and B)
- Each variant gets its own slug and tracks clicks independently
- The experiment page shows: Variant A clicks, Variant B clicks, winner indicator
- Statistical significance shown: "Not enough data yet" → "Variant A is leading" → "Variant A wins with 95% confidence" (use a simple chi-squared test or proportions z-test)
- "Declare winner" button: consolidates future clicks to the winning variant's URL
- Experiment history stored even after declaration

---

### FEATURE 13 — QR CODE GENERATION

- Auto-generate a QR code for every link on creation
- QR code links to the tracking URL (not the original URL)
- Display on the link detail page
- Download as PNG button
- Optional: branded QR code with logo in the center (Business tier)
- QR code should be high resolution (512×512 minimum)
- **Dynamic QR codes**: Because Traqly links are mutable, every QR code is inherently dynamic — changing the link's destination automatically changes where the QR code points. Make this advantage explicit in the UI: show a "Dynamic" badge on each QR code and a tooltip: "This QR code always points to your latest destination — no reprinting needed."

Use `qrcode` npm package for generation.

---

### FEATURE 14 — SHARING FEATURES

**Quick share panel (on every link):**
- Copy short URL to clipboard (1 click)
- Copy caption templates for each platform:
  - WhatsApp: "Check out [title]: [short URL]"
  - Instagram: "Link in bio 👇 [title] — [short URL]"
  - Twitter/X: "[title] [short URL] #business #[tag]"
  - TikTok: "[title] — grab the link 👉 [short URL]"
- UTM parameters auto-appended based on platform selection (utm_source, utm_medium, utm_campaign)
- Download link card as image (link title, short URL, QR code, click count) — shareable to stories

**Shareable report:**
- Generate a view-only report URL for any link or campaign
- No login required for the recipient
- Shows: click trend chart, top country, top source, quality score
- Report URL expires in 7 days (configurable)

**PDF export:**
- Generate a branded PDF report for any time range
- Include: link performance chart, table of daily clicks, traffic sources, geography breakdown, quality score
- Use `puppeteer` or `react-pdf` for generation
- Available on Growth and Business tiers

---

### FEATURE 15 — FRAUD & ANTI-ABUSE SYSTEM

Implement all of the following. This is not optional.

**IP-level protections:**
- Hash all IPs with SHA-256 + a server-side salt before storing (never log raw IPs)
- Redis key: `rate:ip:{ipHash}:{linkId}` with 1-hour TTL
- Max 3 unique-counted clicks per IP per link per hour
- Clicks beyond limit: still redirect, but logged as `DUPLICATE`, not counted in stats

**Device fingerprinting:**
- Client-side: load FingerprintJS on the redirect landing frame (invisible 1px iframe) before the redirect happens, or in a tiny pre-redirect JS snippet
- Send fingerprint hash to `/api/fp` endpoint alongside the click event metadata
- Store fingerprint hash in `ClickEvent.fingerprint`
- If fingerprint has clicked this link before within 30 minutes → `DUPLICATE`
- If fingerprint has clicked this link before but >30 min ago → `RETURN`
- If no prior record → `UNIQUE`

**Bot detection rules (applied in order, first match wins):**
1. User-Agent string is in known bot list (maintain a list of 50+ known crawlers/bots)
2. User-Agent is missing entirely → `BOT`
3. User-Agent claims to be a browser but accepts header is missing → suspect, flag
4. Velocity: >10 clicks from same IP hash in <60 seconds across any links → `BOT`, block IP hash for 24 hours
5. Velocity: >50 clicks from same IP hash in <1 hour across any links → `BOT`, block IP hash for 7 days
6. Headless browser signals: check for `HeadlessChrome` in UA string

**Fraud management UI:**
- Fraud summary card on the dashboard: "Today: X bot clicks blocked, Y duplicates filtered"
- Per-link fraud tab (see Feature 6 Quality tab)
- User can mark a click event as "legitimate" if they believe it was wrongly flagged
- Fraud events are never deleted — they are logged and retained

---

### FEATURE 16 — SUBSCRIPTION & BILLING

**Plan limits:**

| Feature | Free | Growth | Business |
|---|---|---|---|
| Active links | 5 | 25 | Unlimited |
| Workspaces | 1 | 3 | Unlimited |
| Team members | 0 | 3 | 10 |
| Custom slugs | ✅ | ✅ | ✅ |
| A/B testing | ❌ | ✅ | ✅ |
| PDF exports | ❌ | ✅ | ✅ |
| White-label | ❌ | ❌ | ✅ |
| API access | ❌ | ❌ | ✅ |
| VPN detection | ❌ | ❌ | ✅ |
| Mutable link destination | ✅ | ✅ | ✅ |
| Destination history log | ✅ (last 10) | ✅ (full) | ✅ (full + export) |
| Smart routing rules | ❌ | ✅ (3 rules/link) | ✅ (unlimited) |
| Retargeting pixels | ❌ | ✅ (1 pixel/link) | ✅ (3 pixels/link) |
| Password-protected links | ❌ | ✅ | ✅ |
| Social preview customization | ❌ | ✅ | ✅ |
| Link rotator | ❌ | ✅ (up to 5 entries) | ✅ (unlimited) |
| Bio page builder | ✅ (1 page, 5 links) | ✅ (3 pages, 20 links each) | ✅ (unlimited) |
| Data retention | 1 year | 3 years | 5 years + archive |

**Payment flow:**
- Paystack for NGN payments (primary)
- Stripe for USD/international (secondary)
- Webhook handlers for: `subscription.created`, `subscription.cancelled`, `charge.success`, `charge.failed`
- On subscription cancel: user reverts to Free tier at end of billing period, data is preserved
- Plan enforcement middleware: check user's plan before allowing premium actions, show upgrade modal if blocked

**Upgrade modal:**
- Triggered when user tries to exceed a plan limit
- Shows current plan vs what they'd get on the next tier
- "Upgrade now" button → Paystack checkout

---

### FEATURE 17 — REFERRAL SYSTEM

- Every user has a unique referral link: `traqly.io/join?ref=[referralCode]`
- When a referred user signs up and activates their account: referrer gets +30 days added to their current plan (or 30 free days on Growth if on Free)
- Referral dashboard: how many signups, how many activated, total rewards earned
- "Powered by Traqly" watermark on shared reports and link cards on Free tier (generates signups)
- Optional: community referral leaderboard (top referrers this month)

---

### FEATURE 18 — SETTINGS

**Account settings:**
- Update name, email, password, profile photo
- Enable/disable Google OAuth connection
- Delete account (30-day grace period, soft delete)

**Notification preferences:**
- Toggle each notification type on/off
- Choose delivery: in-app only, email only, or both
- Set preferred timezone (for daily digest timing and "best time to post" calculations)
- Set preferred daily digest time

**Workspace settings:**
- Workspace name, logo, slug
- Danger zone: delete workspace

**Billing settings:**
- View current plan
- View next billing date and amount
- Download invoices
- Cancel subscription
- Upgrade/downgrade plan

**API settings (Business tier):**
- Generate and revoke API keys
- View API usage (requests/day)
- Link to API documentation

---

### FEATURE 19 — MUTABLE / LIVE LINKS *(new)*

This is Traqly's most powerful differentiator against services like TinyURL. Once a short link is created in most tools, the destination is frozen forever. Traqly gives users full control to update a link's destination at any time — without ever changing the slug, QR code, or any printed/shared material.

**The core use case:**
A business owner creates position-based links like `/MyWorker01`, `/MyWorker02`. When an employee leaves, they can update `/MyWorker01` to point to the new person's profile/bio/form without losing the link, reprinting materials, or notifying everyone of a new URL.

**Implementation:**

*Updating the destination:*
- From the link detail page or the link list's "Edit" button, users with ADMIN or EDITOR roles can change the `originalUrl` field at any time.
- Before saving, validate the new URL with the `URL` constructor, check it is not a redirect loop to Traqly's own domain, and confirm with the user via a modal: "You are about to update the destination for `/myworker01`. Anyone who clicks this link will now be sent to the new URL. Existing analytics data is preserved. Continue?"
- On confirmation:
  1. Create a `LinkDestinationHistory` record with `previousUrl`, `newUrl`, `changedByUserId`, `changedAt`, and an optional `note`.
  2. Update `Link.originalUrl` and `Link.updatedAt` in the DB.
  3. Immediately invalidate the Redis cache entry for this slug (`slug:[slug]`) so the next click resolves the new URL.
  4. Fire a `DESTINATION_CHANGED` in-app notification to all workspace ADMIN members.
- Show a success toast: "✅ Destination updated. All future clicks will now go to the new URL."

*History audit log:*
- Show the full history of destination changes in the "History" tab on the per-link analytics page (see Feature 6).
- On the click trend chart (Overview tab), render a vertical dashed line with a marker icon at each date a destination was changed. Hovering the marker shows: "Destination changed by [user] — new URL: [url]".
- Annotate the Raw Log tab too: clicks before a destination change show the resolved URL at the time of the click (stored in `ClickEvent.resolvedUrl`).

*Analytics integrity:*
- The `ClickEvent.resolvedUrl` field captures which URL each individual click was actually sent to, so historical analytics always reflect what the user was seeing at that time, even after many destination changes.
- In the Overview stats, show a note if the link has had destination changes: "⚠️ This link's destination was updated [N] time(s). Click data may span different URLs. See the History tab for details."

*Security:*
- Only ADMIN and EDITOR roles can update the destination. VIEWERs cannot.
- Every change is logged with the acting user's ID — full audit trail.
- Free plan users see only the last 10 history entries. Growth and Business users see full history.

---

### FEATURE 20 — SMART ROUTING *(new)*

Smart Routing allows a single short link to redirect users to different destination URLs based on detected conditions. This is extremely powerful for the Traqly target audience — e.g., sending Nigerian users to a Paystack checkout and international users to a Stripe checkout, or routing mobile users to an app store and desktop users to a website.

**Routing rule types:**
- **Geo (Country)**: Match by ISO 3166-1 alpha-2 country code (e.g. "NG", "GH", "KE"). Use MaxMind GeoLite2 data already collected during click processing.
- **Device**: Match by device type: `mobile`, `desktop`, or `tablet`.
- **OS**: Match by operating system: `android`, `ios`, `windows`, `macos`, `linux`.
- **Language**: Match by the browser's `Accept-Language` header primary language (e.g. "en", "fr", "yo").
- **Time of Day**: Match by hour range in the user's local time (e.g. "09:00-17:00"). Use the geo-resolved timezone where possible; fall back to UTC.
- **Day of Week**: Match by weekday (e.g. "monday", "saturday").

**Rule evaluation:**
- Rules are evaluated in `priority` order (lowest number first).
- First matching rule wins. If no rule matches, redirect to `Link.originalUrl` (the default destination).
- Rules are stored in `SmartRoutingRule` with `linkId`, `ruleType`, `matchValue`, `destination`, `priority`, `isActive`.
- Resolution happens at the start of the redirect handler (before queueing the click event), so the matched destination is stored in `ClickEvent.resolvedUrl`.

**Smart Routing UI (per-link settings > "Smart Routing" tab):**
- Toggle Smart Routing on/off for the link (off by default)
- Table of active rules: Rule Type | Match Value | Destination | Priority | Active toggle | Edit | Delete
- "Add rule" button → modal with fields: Rule Type (dropdown), Match Value (contextual input — country picker for GEO, OS picker for OS, etc.), Destination URL, Priority
- Drag-to-reorder for priority sorting
- "Test routing" tool: user enters a hypothetical country, device, and OS → system shows which rule would match and which URL they'd be sent to
- Plan enforcement: show upgrade prompt if user is on Free plan

**Analytics integration:**
- The Traffic Sources tab gains a "Smart Routing breakdown" section showing how many clicks matched each rule vs went to the default destination.
- The Devices tab already shows OS/device breakdown, so Smart Routing performance is naturally visible there.

**Common use cases to highlight in the UI (shown as templates when adding rules):**
1. App Store routing: iOS → App Store URL | Android → Play Store URL | Default → marketing website
2. Regional pricing: NG → Paystack checkout | Other → Stripe checkout
3. Language routing: French browsers → French-language landing page | Default → English page
4. Business hours: Mon–Fri 09:00–17:00 → live chat link | Other → booking form

---

### FEATURE 21 — RETARGETING PIXELS *(new)*

Allow users to attach ad platform tracking pixels to any Traqly link, so that every person who clicks the link is automatically added to a custom audience on that ad platform — enabling retargeting without needing to own the destination website.

**Supported pixels:**
- **Meta (Facebook/Instagram) Pixel**: fires `PageView` event
- **Google Ads**: fires a conversion/remarketing tag
- **TikTok Pixel**: fires `ViewContent` event
- **Custom**: user provides a raw script tag (Business tier only)

**How it works (technical):**
- When a link has active pixel integrations, the redirect endpoint does NOT do an immediate 302.
- Instead, it serves a lightweight intermediate HTML page (< 5KB, renders in < 200ms) that:
  1. Fires all attached pixel scripts in `<head>`
  2. After a 300ms delay (enough for pixels to fire), redirects the user via `window.location` or `<meta http-equiv="refresh">`
- This intermediate page has no visible UI — just a blank screen with a spinner or the link's title as the page title.
- The click event is still processed asynchronously after the page is served.
- **Important**: Make this behavior explicit in the link settings so users understand there is a brief intermediate step.

**Pixel management UI (per-link settings > "Pixels" tab):**
- List of attached pixels: Type | Pixel ID | Status | Remove
- "Add pixel" button → select type → enter pixel ID → save
- Visual indicator on the link card (pixel icon) if any pixels are active
- Plan enforcement: Growth = 1 pixel per link, Business = 3 pixels per link, plus Custom pixel type

**Analytics:**
- The click event still gets logged normally — pixel firing does not affect click count or quality classification.
- A `pixelFired: true` flag can be added to the ClickEvent metadata for debugging.

---

### FEATURE 22 — LINK ROTATOR *(new)*

The Link Rotator allows a single short link to cycle through multiple destination URLs, distributing traffic across them. This is useful for sending different customers to different team members, split-testing multiple landing pages, or alternating between promotional offers.

**Two distribution modes:**
- **Round-Robin**: Each click is sent to the next destination in sequence. Equal distribution.
- **Weighted**: Each destination has a weight (e.g. 70/30 split). Traffic is allocated proportionally.

**Rotator management UI (per-link settings > "Rotator" tab):**
- Toggle Rotator on/off (when on, Smart Routing rules still apply first; if a routing rule matches, it overrides the rotator)
- Mode selector: Round-Robin or Weighted
- List of rotator entries: Label | Destination URL | Weight | Click Count | Share % | Active toggle | Edit | Delete
- "Add entry" button → enter label, URL, and weight
- Real-time share % preview updates as weights are changed
- When Rotator is active, the link's "Destination" column in the link list shows "Rotator (N destinations)" instead of a URL

**Analytics:**
- The Rotator breakdown section (in Overview tab) shows a donut chart: what % of clicks went to each rotator destination
- Each entry's click count is stored in `LinkRotatorEntry.clickCount` (updated by the click processor)
- Redis key `rotator:next:{linkId}` tracks the current round-robin position for performance

**Plan limits:** Growth tier = up to 5 entries per link, Business = unlimited.

---

### FEATURE 23 — PASSWORD-PROTECTED LINKS *(new)*

Allow users to add a password to any link, so that only people who know the password can access the destination. Useful for sharing exclusive content, internal team links, or gated offers.

**How it works:**
- If `Link.isPasswordProtected = true`, the redirect endpoint at `/r/[slug]` redirects to `/r/[slug]/auth` instead of the destination.
- `/r/[slug]/auth` is a branded, minimal password entry page showing:
  - The link's title (if set) or "Protected Link"
  - Traqly branding (or white-label branding on Business tier)
  - A password input field and "Continue" button
- On correct password: set a signed session cookie (1 hour TTL) and redirect to the destination. Log the click event as normal.
- On incorrect password: show "Incorrect password" error. Log the attempt as a `ClickEvent` with `quality: BOT` and `fraudReason: "incorrect_password_attempt"` after 5 failed attempts from the same IP.
- The password is stored as a bcrypt hash in `Link.password`. The plaintext is never stored.

**Password management UI (per-link settings > "Security" tab):**
- Toggle "Password protect this link" on/off
- Set password field (show/hide toggle)
- "Copy shareable note" — generates text: "Access link: [short URL] | Password: [password]"
- Show count of blocked (wrong-password) attempts on the link detail page

**Plan limits:** Growth and Business tiers only.

---

### FEATURE 24 — SOCIAL PREVIEW CUSTOMIZATION *(new)*

When a Traqly link is shared on WhatsApp, Facebook, Telegram, Twitter, or iMessage, platforms fetch Open Graph (OG) metadata from the link URL to generate a preview card. By default, platforms would try to fetch OG tags from the destination URL — but since Traqly redirects immediately, they often get no preview at all.

This feature lets users set a custom title, description, and image for each link so that sharing on social platforms generates a rich, professional-looking preview.

**How it works (technical):**
- Traqly must serve a small intermediate HTML page at `/r/[slug]` that contains the OG meta tags, then redirects users almost immediately.
- For bots and crawlers (detected by UA), serve the full OG HTML page with NO redirect — so platforms can scrape the preview metadata.
- For real users, serve the page with an immediate JS redirect (`window.location = destination`) AND a `<meta http-equiv="refresh" content="0">` fallback. This means real users experience no perceptible delay.
- This approach is compatible with the retargeting pixel intermediate page (Feature 21) — combine them if both are active.

**OG fields per link:**
- `customOgTitle`: Shown as the preview headline (max 60 chars)
- `customOgDescription`: Shown as the preview body text (max 160 chars)
- `customOgImage`: URL to an uploaded image (recommended 1200×630px). Store in Cloudflare R2 / AWS S3.

**Customization UI (per-link settings > "Social Preview" tab):**
- Toggle "Customize social preview" on/off (when off, Traqly uses the destination page's own OG tags if fetchable, or no preview)
- Title input field with character counter
- Description textarea with character counter
- Image upload component (drag-and-drop, accepts JPEG/PNG up to 2MB)
- **Live preview panel** showing how the link will look when shared on WhatsApp and Facebook — rendered as a mock WhatsApp message bubble and a Facebook link card (using the entered values)
- "Test preview" button — opens a checker tool (or links to Facebook's Sharing Debugger / WhatsApp's test preview)

**Plan limits:** Growth and Business tiers only.

---

### FEATURE 25 — LINK-IN-BIO PAGE BUILDER *(new)*

A large proportion of Traqly's target users (African SMBs) use Instagram, TikTok, and Twitter — platforms where you get only one link in your bio. The Link-in-Bio page builder lets users create a branded multi-link landing page accessible at `traqly.io/bio/[slug]` (or on a custom domain for Business tier), replacing the need for tools like Linktree.

Every link on the bio page is a full Traqly tracked link, so each click is counted and attributed.

**Bio page structure:**
- Profile avatar (uploaded image)
- Display name
- Short bio text (max 150 characters)
- Up to N buttons (links), each with: icon/emoji, button label, and destination (can be a raw URL or an existing Traqly short link)
- Background color or gradient (from a curated palette)
- Button style: color, text color, border-radius (rounded vs square vs pill)

**Creating/editing a bio page:**
- `/bio/new` — create page form with live preview panel (right column updates as user types)
- `/bio/[id]/edit` — edit existing page
- Drag-to-reorder the links on the page
- Toggle individual links active/inactive without removing them

**Tracking:**
- Each bio page link button click is tracked as a `BioPageLink.clickCount` increment (simple counter, not a full ClickEvent, to keep things lightweight)
- For full analytics on a bio page button, the user should set that button's URL to an existing Traqly short link — then full click analytics are available on the link's detail page

**Analytics (bio page detail page):**
- Total page views (tracked via a lightweight pageview counter, not full click event)
- Per-link click count and % of page views that clicked each link
- Top link (most clicked button)

**Public bio page (`/bio/[slug]`):**
- Mobile-optimized, fast-loading (no heavy JS frameworks on the public page — use Next.js SSR with minimal client JS)
- Shows "Powered by Traqly" footer link on Free tier (drives signups); removable on Growth+
- Custom domain support on Business tier: user can point their own domain (e.g. `links.mybrand.com`) to their bio page

**Plan limits:** Free = 1 bio page with max 5 links; Growth = 3 bio pages with max 20 links each; Business = unlimited.

---

## UI/UX DESIGN SYSTEM

> This section is the law. Every screen in Traqly must conform to every rule here. If you are unsure whether a component looks good enough, compare it mentally to the Stripe dashboard or Linear. If it does not match that quality, rebuild it.

---

### OVERALL VISUAL AESTHETIC

Use a **dark-first premium SaaS aesthetic**. The default theme is dark mode. Light mode is supported and togglable but secondary. The visual language combines:

- Soft depth and layered surfaces (cards sit slightly above the background)
- Glassmorphism used selectively — only in modals, command palettes, notification dropdowns, and floating panels. Never on main content cards.
- Refined shadows with color-tinted glow (not flat box-shadows)
- Smooth gradients — used in CTAs, hero sections, chart fills, and accent elements. Never garish.
- Excellent spacing rhythm — every element breathes but nothing is wasted
- Sharp typographic hierarchy — users must be able to read the most important number on any screen within 1 second

The interface should feel: **fast, intelligent, alive, and premium.**

---

### DESIGN TOKENS & COLOR SYSTEM

Create a complete design token system. Define all tokens in `tailwind.config.ts` and as CSS custom properties in `globals.css`. Every color used in the UI must come from this system — no ad-hoc Tailwind color classes like `bg-blue-500` anywhere.

#### Brand Colors

```css
/* globals.css — CSS custom properties */
:root {
  /* Primary accent — electric indigo/violet */
  --color-brand:        #6366F1;   /* Indigo 500 — primary buttons, active nav, links */
  --color-brand-light:  #818CF8;   /* Indigo 400 — hover states, lighter accents */
  --color-brand-dark:   #4F46E5;   /* Indigo 600 — pressed states */
  --color-brand-glow:   rgba(99, 102, 241, 0.25); /* glow/ring on focus */

  /* Gradient definitions */
  --gradient-brand:     linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%);
  --gradient-brand-alt: linear-gradient(135deg, #06B6D4 0%, #6366F1 100%);
  --gradient-success:   linear-gradient(135deg, #10B981 0%, #06B6D4 100%);

  /* Semantic colors */
  --color-success:      #10B981;   /* Emerald — positive metrics, goals hit */
  --color-success-dim:  rgba(16, 185, 129, 0.15);
  --color-warning:      #F59E0B;   /* Amber — warnings, goal reminders */
  --color-warning-dim:  rgba(245, 158, 11, 0.15);
  --color-danger:       #F43F5E;   /* Rose — fraud, errors, danger actions */
  --color-danger-dim:   rgba(244, 63, 94, 0.15);
  --color-info:         #06B6D4;   /* Cyan — informational, spikes, tips */
  --color-info-dim:     rgba(6, 182, 212, 0.15);

  /* Dark theme surfaces */
  --bg-base:            #0B1120;   /* Deepest background */
  --bg-surface:         #0F172A;   /* Primary page background */
  --bg-elevated:        #1E293B;   /* Cards, panels */
  --bg-overlay:         #263347;   /* Hover states, selected rows */
  --bg-modal:           rgba(15, 23, 42, 0.92); /* Modal/glass backdrop */

  /* Borders */
  --border-subtle:      rgba(255, 255, 255, 0.06);
  --border-default:     rgba(255, 255, 255, 0.10);
  --border-strong:      rgba(255, 255, 255, 0.18);
  --border-brand:       rgba(99, 102, 241, 0.4);

  /* Text */
  --text-primary:       #F1F5F9;   /* Main content */
  --text-secondary:     #94A3B8;   /* Labels, metadata */
  --text-tertiary:      #475569;   /* Placeholders, disabled */
  --text-inverse:       #0F172A;   /* Text on light backgrounds */
  --text-brand:         #818CF8;   /* Brand-colored text */

  /* Shadows */
  --shadow-sm:    0 1px 3px rgba(0,0,0,0.4);
  --shadow-md:    0 4px 16px rgba(0,0,0,0.5);
  --shadow-lg:    0 12px 40px rgba(0,0,0,0.6);
  --shadow-brand: 0 0 20px rgba(99,102,241,0.3);
  --shadow-glow:  0 0 40px rgba(99,102,241,0.15);
}
```

Map all tokens to Tailwind in `tailwind.config.ts`:
```js
theme: {
  extend: {
    colors: {
      brand: { DEFAULT: 'var(--color-brand)', light: 'var(--color-brand-light)', dark: 'var(--color-brand-dark)' },
      surface: { base: 'var(--bg-base)', DEFAULT: 'var(--bg-surface)', elevated: 'var(--bg-elevated)', overlay: 'var(--bg-overlay)' },
      // etc.
    }
  }
}
```

#### Chart Color Palette

Charts must use this exact palette — never default Recharts colors:
- Primary series: `#6366F1` with `rgba(99,102,241,0.15)` fill gradient
- Secondary series: `#06B6D4`
- Tertiary series: `#8B5CF6`
- Success line: `#10B981`
- Danger line: `#F43F5E`
- Grid lines: `rgba(255,255,255,0.04)`
- Tooltip background: `#1E293B` with `border: 1px solid rgba(255,255,255,0.10)`

---

### TYPOGRAPHY

Configure Geist as the primary font via `next/font`. Set up in `src/app/layout.tsx` and apply to `<html>`.

Typography scale — use these exact classes:

```
Display:    text-5xl font-bold tracking-tight     — hero headings, marketing
H1:         text-3xl font-semibold tracking-tight — page titles
H2:         text-xl  font-semibold tracking-tight — section headings
H3:         text-base font-medium                 — card headings, subsections
Label:      text-xs  font-medium uppercase tracking-widest text-secondary — form labels, table headers
Body:       text-sm  font-normal                  — general content
Caption:    text-xs  font-normal text-tertiary     — timestamps, hints
Stat:       text-4xl font-bold tabular-nums tracking-tight — analytics numbers
Stat-sm:    text-2xl font-semibold tabular-nums   — smaller metrics
```

Rules:
- All analytics numbers must use `tabular-nums` and `font-variant-numeric: tabular-nums` so digits don't shift width
- Headings must use `tracking-tight` — never default letter spacing on bold text
- Labels (form labels, table column headers) must be uppercase, `text-xs`, `tracking-widest`, `text-secondary`
- Never mix more than 3 font weights on one screen

---

### LAYOUT & SPACING

The spacing system must feel intentional and rhythmic. Follow an 8px base unit.

**App shell layout:**
```
┌─────────────────────────────────────────────┐
│  Topbar (h-14, border-bottom)               │
├───────────┬─────────────────────────────────┤
│           │                                 │
│  Sidebar  │   Main Content Area             │
│  (w-60    │   (flex-1, overflow-y-auto)     │
│  collaps- │                                 │
│  ible)    │                                 │
│           │                                 │
└───────────┴─────────────────────────────────┘
```

Content area padding: `px-6 py-6` on desktop, `px-4 py-4` on mobile.

**Dashboard grid:** Use an asymmetric grid — NOT equal-column card grids. Example for main dashboard:
- Row 1: 4 compact KPI tiles (each different width: 2 wide, 1 wide, 1 wide)
- Row 2: Large chart (span 8 cols) + compact sidebar panel (span 4 cols)
- Row 3: Activity feed (span 5) + Leaderboard preview (span 4) + Best-time widget (span 3)

Avoid: rows of 4 identical-sized cards. Every layout should have visual hierarchy.

**Card spacing:** `p-5` for normal cards, `p-6` for feature-highlighted cards. Never `p-4` on analytics cards (too cramped) or `p-8` (too spacious).

---

### COMPONENT DESIGN SPECIFICATIONS

#### Cards

Every card must follow this pattern:
```tsx
<div className="
  bg-surface-elevated
  border border-border-default
  rounded-xl
  p-5
  shadow-md
  transition-all duration-200
  hover:border-border-strong
  hover:shadow-lg
  group
">
```

- Background: `--bg-elevated` (#1E293B)
- Border: `1px solid --border-default`
- Border radius: `rounded-xl` (12px)
- Hover: border brightens, shadow deepens slightly
- For clickable cards: add `cursor-pointer` and a subtle `translateY(-1px)` on hover via Framer Motion

Stat cards specifically must have:
- A small colored icon or dot in the top-left indicating the metric type
- The primary number large and bold (`text-4xl font-bold tabular-nums`)
- A small trend indicator (green up-arrow or red down-arrow with % change)
- A muted label below

#### Buttons

**Primary button:**
```tsx
className="
  bg-brand hover:bg-brand-light
  text-white font-medium text-sm
  px-4 py-2 rounded-lg
  shadow-brand
  transition-all duration-150
  hover:shadow-lg hover:scale-[1.02]
  active:scale-[0.98]
"
```
- Must have a subtle box-shadow with the brand color glow
- Scale micro-interaction on hover and active
- Use Framer Motion `whileHover` and `whileTap` for the scale

**Secondary button:**
```tsx
className="
  bg-transparent
  border border-border-default hover:border-border-strong
  text-primary hover:text-brand
  font-medium text-sm
  px-4 py-2 rounded-lg
  transition-all duration-150
"
```

**Destructive button:**
- `bg-danger/10 hover:bg-danger/20 text-danger border border-danger/30`

**Ghost/Icon button:**
- `p-2 rounded-lg hover:bg-surface-overlay text-secondary hover:text-primary`
- Used for sidebar icons, table row actions

Never use Tailwind's default `blue-600` or `gray-100` button styles.

#### Sidebar

The sidebar is a core navigation element and must feel premium:

```
Width:    240px expanded, 64px collapsed
Position: Fixed left, full height
BG:       var(--bg-surface) with right border: 1px solid var(--border-subtle)
```

Structure (top to bottom):
1. **Logo area** — Traqly wordmark + icon. 40px height. Clicking collapses/expands on desktop.
2. **Workspace switcher** — Compact dropdown showing current workspace name + avatar. Clicking opens a popover with all workspaces + "New workspace" option.
3. **Navigation items** — Grouped with subtle section labels ("ANALYTICS", "MANAGE", "ACCOUNT"). Each nav item: icon (20px) + label. Active item: `bg-brand/10 text-brand border-r-2 border-brand`. Inactive: `text-secondary hover:text-primary hover:bg-surface-overlay`.
4. **Bottom section** — User avatar + name + plan badge. Settings icon. Notification bell with unread count.

Collapse behavior:
- On collapse: labels fade out, icons remain. Tooltip appears on hover.
- Animate with Framer Motion `AnimatePresence` + `width` transition (300ms ease).

#### Tables

Analytics tables must look elite. Inspired by Stripe's transaction tables and Linear's issue lists.

```tsx
// Table wrapper
<div className="rounded-xl border border-border-default overflow-hidden">
  <table className="w-full">
    <thead className="bg-surface-base border-b border-border-subtle">
      <tr>
        <th className="text-xs font-medium uppercase tracking-widest text-tertiary px-4 py-3 text-left">
```

Rules:
- Header: background one step darker than the table body, uppercase tracking-widest labels
- Row hover: `hover:bg-surface-overlay` with a smooth 100ms transition
- Row dividers: `border-b border-border-subtle` — very subtle
- No thick borders anywhere
- Status badges/pills: colored with `bg-[color]/15 text-[color]` pattern (not solid filled)
- Sticky header on scroll for tables with many rows
- Compact row height: `py-3 px-4`
- Sort icons appear on header hover

#### Badges & Status Pills

```tsx
// Active
<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success/15 text-success">
  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
  Active
</span>

// Paused
<span className="...bg-warning/15 text-warning">Paused</span>

// Bot/Fraud
<span className="...bg-danger/15 text-danger">Bot</span>

// Brand/Info
<span className="...bg-brand/15 text-brand-light">Unique</span>
```

Never use solid filled badges. Always use `bg-color/15` with matching text color.

#### Modals & Dialogs

- Backdrop: `rgba(0,0,0,0.7)` blur with `backdrop-blur-sm`
- Modal card: `bg-bg-elevated border border-border-default rounded-2xl shadow-lg`
- Max width: `max-w-lg` for standard modals, `max-w-2xl` for complex forms
- Animate in: Framer Motion `scale: 0.95 → 1` + `opacity: 0 → 1`, 200ms spring
- Animate out: reverse, 150ms
- Confirmation modals (destructive actions): show the destructive button on the right, secondary/cancel on the left

#### Toast Notifications

Use a custom toast system (or sonner/react-hot-toast styled to match the design):
- Position: bottom-right
- Style: `bg-surface-elevated border border-border-strong rounded-xl shadow-lg px-4 py-3`
- Success: left border accent in `--color-success`
- Error: left border accent in `--color-danger`
- Info: left border accent in `--color-brand`
- Animate in from right: `translateX(100%) → translateX(0)`, 250ms spring

#### Skeleton Loaders

All skeleton states must use animated shimmer, NOT static gray blocks:
```css
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}
.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-elevated) 25%,
    var(--bg-overlay) 50%,
    var(--bg-elevated) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 6px;
}
```

---

### CHART DESIGN SPECIFICATIONS

Charts are the emotional core of Traqly. They must look exceptional.

**Area charts (click trend):**
- Line: 2px, color `--color-brand`
- Fill: gradient from `rgba(99,102,241,0.3)` at top to `rgba(99,102,241,0)` at bottom
- Data points: 4px dots visible on hover, with a glow ring (`box-shadow: 0 0 6px var(--color-brand)`)
- Grid lines: `rgba(255,255,255,0.04)` horizontal only — no vertical grid
- X/Y axis labels: `text-xs text-tertiary`
- Animate in on mount: line draws from left to right using `stroke-dasharray` animation

**Donut charts (traffic sources, device split):**
- Stroke width: 20px
- Corner radius: 4px on each segment
- Center: show the total number in large bold text + label below
- Hover: segment lifts slightly (scale 1.04) and shows tooltip
- Legend: to the right or below, with color dot + label + value + %

**Tooltip design:**
```
┌─────────────────────────┐
│ Mon, Jan 12             │  ← date header, text-xs text-secondary
│ ─────────────────────── │
│ ● Unique clicks    247  │  ← color dot + label + bold value
│ ○ Total clicks     312  │
└─────────────────────────┘
Background: var(--bg-elevated)
Border: 1px solid var(--border-strong)
Border-radius: 10px
Shadow: var(--shadow-md)
Padding: 12px 16px
```

**Real-time counter cards:**
- The number must animate using `react-countup` whenever it changes
- Show a small "live" pulse dot (green, 6px, animated pulse) next to the label
- Wrap in a subtle glow when the number just updated

---

### MICROINTERACTIONS & MOTION SYSTEM

Use Framer Motion throughout. All motion must feel intentional — not flashy, not laggy. The goal is that users feel the interface responding to them.

**Page transitions:**
```tsx
// Wrap every page in this
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
>
```

**List item stagger (link list, notification list, leaderboard):**
```tsx
// Each item
<motion.div
  initial={{ opacity: 0, x: -12 }}
  animate={{ opacity: 1, x: 0 }}
  transition={{ delay: index * 0.04, duration: 0.2 }}
>
```

**Counter updates:**
When a real-time click counter increments:
1. The number fades out and counts up using react-countup (200ms)
2. The card gets a brief glow pulse: `box-shadow` brightens then fades (400ms)

**Chart load animation:**
On mount, area charts draw from left to right over 800ms using SVG stroke animation.

**Hover states:**
- Cards: `translateY(-1px)` over 150ms
- Buttons: `scale(1.02)` over 100ms
- Table rows: background transition over 80ms
- Sidebar items: background transition over 100ms

**Tab switching:**
- Content fades out (80ms) and fades in (150ms) with a subtle 4px upward translate

**Modal open/close:**
- Open: `scale(0.96) opacity(0)` → `scale(1) opacity(1)`, spring animation
- Close: reverse, 150ms

**Notification bell:**
When a new notification arrives:
- Bell icon does a subtle `rotate(-15deg) → rotate(15deg) → 0` swing animation (300ms)
- Unread count badge scales in from 0

**Number pulse on update:**
When a stat updates in real time, the card briefly flashes with a brand-color left border accent.

---

### EMPTY STATES

Every empty state is a product moment. Design each one with care.

Structure of every empty state:
1. Centered icon (SVG illustration or a large Lucide icon in a rounded square with `bg-brand/10`)
2. Heading: concise and human (max 6 words)
3. Subtext: one sentence explaining what will appear here and what to do
4. Primary CTA button

Examples (use these exact copy directions):

| Page | Heading | Subtext |
|------|---------|---------|
| /links | "No links yet" | "Create your first trackable link and see who's clicking in real time." |
| /campaigns | "No campaigns running" | "Group your links into campaigns to measure performance across a promotion." |
| /notifications | "You're all caught up" | "Traqly will notify you when your links hit milestones, spikes, or goals." |
| /leaderboard | "No clicks today — yet" | "Share your links and watch your leaderboard come alive." |
| Analytics (no data) | "Waiting for your first click" | "Your analytics will appear here as soon as someone clicks this link." |

Never say "No data found." Never say "Nothing here." Speak like a product, not a database.

---

### PER-PAGE DESIGN SPECIFICATIONS

#### `/` — Landing Page

This is the product's public face. It must be stunning enough to convert.

Structure:
1. **Navbar** — Traqly logo left, nav links center (Features, Pricing, Changelog), Sign in + Get Started right. Transparent on scroll start, `bg-surface/80 backdrop-blur-md` after scrolling 60px.
2. **Hero section** — Full-width. Gradient headline (white → brand color). Subheadline in `text-secondary`. Two CTAs: "Start for free" (primary) + "See how it works" (ghost). Background: animated grid or subtle dot pattern in dark navy. Optional: rotating/sliding social proof logos.
3. **Social proof bar** — "Trusted by X businesses across Y countries" with small brand/user avatars.
4. **Feature sections** — 3–4 alternating image+text rows. Each shows a dark mockup of the actual dashboard.
5. **Analytics preview** — A live-looking (but static) mockup of the analytics dashboard, used as the main visual.
6. **Pricing section** — 3-column card layout (Free, Growth, Business). Most popular card has a brand gradient border.
7. **Testimonials** — 3 cards in a row or infinite scroll marquee.
8. **CTA section** — Full-width gradient background, centered CTA.
9. **Footer** — Dark, links organized in columns, Traqly logo, social links.

#### `/dashboard` — Main Dashboard

This is the most important screen. Every element must earn its place.

Layout:
- **Top row**: 4 KPI tiles — Today's Clicks, Unique Clicks, Active Links, Fraud Blocked. Each has a colored icon, a large animated counter, and a trend indicator vs yesterday.
- **Main chart**: Large area chart (full week, auto-scaling). Title: "Click Performance". Toggle: Unique / Total / Fraud.
- **Right panel**: "Top Links Today" — compact list of top 5 links with click bars. Below: "Best Time to Post" heatmap widget.
- **Bottom left**: "Live Activity" feed — last 10 clicks, each with country flag, device icon, link name, time ago. New items animate in from top.
- **Bottom right**: Leaderboard preview + streak highlights.

#### `/links` — Link List

Inspired by Linear's issue list and Stripe's event log.

- Header row: Title + search bar (left) + filter chips + "New Link" button (right)
- Filter chips: All | Active | Paused | Expired — pill-style, animated active state
- Table view (default): compact rows, hover reveals action buttons (Copy URL, Edit, Analytics, ⋯ menu)
- Card view (toggle): each link card shows QR preview, click sparkline, key stats
- Each row/card shows: Streak badge if active, quality score dot, live click counter for today
- Bulk selection: checkbox appears on row hover, bulk action bar slides in from bottom

#### `/links/[id]` — Per-Link Analytics

This is the analytics command center. It should feel like a mission control screen.

- **Header**: Link title + slug chip (copyable) + status badge + action buttons (Edit, Share, QR Code, ⋯)
- **Stats row**: 5 KPI tiles — Today, This Week, Total, Quality Score, Streak
- **Tab bar**: Overview | Sources | Geography | Devices | Quality | History | Raw Log
- **Overview tab**: Large click trend chart with destination-change markers. Goal progress ring. Streak flame.
- Geography tab: must use `react-simple-maps` with dark map tiles and glowing country highlights proportional to click volume.

#### `/r/[slug]/auth` — Password Entry Page

Even this page must look premium:
- Centered card on a dark background with a subtle animated gradient
- Traqly logo at top
- Lock icon in brand color
- "This link is password protected" heading
- Password input with show/hide toggle
- "Continue" button (full width, primary style)
- Error state: input border turns danger-colored, shake animation (Framer Motion `x` keyframes)

#### `/bio/[slug]` — Public Bio Page

Must feel like a premium Linktree alternative:
- Mobile-first, max-width 480px centered
- Smooth gradient or blurred background (customized by user)
- Avatar (circular, 80px), display name, bio text
- Link buttons: full-width, pill-shaped, with smooth hover elevation
- "Powered by Traqly" footer link (Free tier) — styled subtly, not embarrassingly
- Page load: buttons stagger in from bottom using Framer Motion

---

### DARK MODE & LIGHT MODE

Dark mode is the default and primary mode. Light mode must also look premium — not just "inverted dark".

For light mode, use:
- Background: `#F8FAFC` (slate-50)
- Surface/cards: `#FFFFFF` with `border: 1px solid #E2E8F0`
- Text primary: `#0F172A`
- Text secondary: `#64748B`
- Keep brand colors the same (indigo/violet)

Use Next.js + `next-themes` for theme management. Persist preference in localStorage. Respect `prefers-color-scheme` on first visit.

---

### MOBILE EXPERIENCE

Mobile is NOT secondary for Traqly. Many African SMB users operate entirely from their phones.

Rules:
- Bottom navigation bar on mobile (Dashboard, Links, Campaigns, Notifications, Profile) — replaces sidebar
- All dashboard cards stack to single column
- Charts: simplified on mobile — no legend overlap, larger touch targets for tooltip
- Tables: horizontal scroll on mobile with sticky first column (link name)
- "New Link" button: always visible as a floating action button (FAB) on mobile, bottom-right, brand gradient
- All tap targets: minimum 44px height
- Modal sheets on mobile: slide up from bottom (not centered dialog) using Framer Motion `y` animation

---

### FINAL UI CHECKLIST

Before considering any screen complete, verify:

- [ ] All colors come from the design token system — no raw Tailwind color classes
- [ ] Typography follows the defined scale — no arbitrary font sizes
- [ ] All interactive elements have hover AND active states
- [ ] All async data has a skeleton loading state
- [ ] All empty states have illustration + heading + subtext + CTA
- [ ] All forms have validation errors styled in danger color with shake animation
- [ ] Charts use the defined palette and have animated load transitions
- [ ] All number stats use `react-countup` and animate on change
- [ ] Framer Motion page transition wraps every page
- [ ] The screen looks good on both 1280px desktop AND 390px mobile
- [ ] No flat white boxes, no giant gray cards, no default shadcn aesthetics
- [ ] The screen could appear in a YC startup's Product Hunt launch screenshots

---

## UI/UX REQUIREMENTS

**Key pages:**
1. `/` — Marketing landing page (explain the product, pricing, CTA to sign up)
2. `/auth/login` — Login
3. `/auth/register` — Registration
4. `/dashboard` — Main workspace dashboard
5. `/links` — Link list
6. `/links/new` — Create new link
7. `/links/[id]` — Per-link analytics
8. `/links/[id]/edit` — Edit link settings (destination, smart routing, pixels, rotator, security, social preview)
9. `/campaigns` — Campaign list and manager
10. `/leaderboard` — Leaderboard (Daily / Weekly / All-time tabs)
11. `/achievements` — All earned badges and streak display
12. `/goals` — Goal management
13. `/notifications` — Full notification centre
14. `/settings` — Account, workspace, notifications, billing
15. `/admin/system` — System health monitor (superadmin only)
16. `/r/[slug]` — Click redirect endpoint (no UI, just redirect logic)
17. `/r/[slug]/auth` — Password entry page for protected links
18. `/expired` — "This link has expired" page (branded)
19. `/bio/[slug]` — Public-facing bio page (SSR, mobile-optimized)
20. `/bio` — Bio page list (dashboard)
21. `/bio/new` — Create bio page
22. `/bio/[id]/edit` — Edit bio page

---

## MONITORING & OBSERVABILITY

**Application-level monitoring (build this, do not rely on external services):**

1. **System health page** (`/admin/system`) — described in Feature 11
2. **Error logging**: Use `winston` or `pino` for structured server-side logging. Log every error with: timestamp, route, user ID (if available), error message, stack trace. Write logs to stdout in production (so hosting platforms capture them).
3. **Performance tracking**: Instrument the `/r/[slug]` redirect endpoint with a timer. Log response time for every request. Alert if P95 exceeds 300ms over a 5-minute window.
4. **Queue monitoring dashboard** (embedded in `/admin/system`): Show BullMQ stats using `bull-board` or a custom component pulling from BullMQ's `getJobCounts()` API. Display: waiting, active, completed, failed, delayed counts.
5. **Cron job health**: Each cron job writes a `last_run` timestamp and `status` to a `cron_log` table in the DB after completion. The admin page reads these and shows green/yellow/red status indicators.
6. **Real-time click rate graph**: On the admin page, show a live line chart of clicks/minute across the entire platform (last 60 minutes), pulled from Redis counters.

---

## ERROR HANDLING & EDGE CASES

Handle every one of these explicitly:

- Slug not found → 404 page with "Link not found" message and CTA to create an account
- Link expired → redirect to `/expired` page with link title and expiry message
- Link paused → still redirect (do not expose that the link is paused to the clicker)
- Link password-protected → redirect to `/r/[slug]/auth`; after 5 failed attempts from same IP, block for 1 hour
- Smart routing rule destination is invalid or unreachable → fall back to `Link.originalUrl`, log a warning
- Rotator has no active entries → fall back to `Link.originalUrl`
- Redirect loop detection → if destination URL resolves to the same domain as Traqly, reject at link creation AND at destination update time
- Malformed URL at link creation OR destination update → validate with `URL` constructor, reject if invalid
- Database unavailable during redirect → fall back to Redis cache; if Redis also unavailable, redirect anyway and skip analytics logging
- BullMQ worker crash → jobs are automatically retried 3 times with exponential backoff
- Failed geo lookup → store `country: "Unknown"`, do not block click recording
- Paystack/Stripe webhook fails → queue for retry, alert admin
- Email delivery failure → log, retry once after 10 minutes, log final failure
- Bio page slug not found → friendly 404 page
- Bio page link with a deleted Traqly short link → still show the button, redirect directly to the stored raw URL

---

## API DESIGN (for Business tier and internal use)

All API routes are prefixed with `/api/v1/`.

```
GET    /api/v1/links                         # List workspace links
POST   /api/v1/links                         # Create link
GET    /api/v1/links/:id                     # Get link details
PATCH  /api/v1/links/:id                     # Update link (including destination URL)
DELETE /api/v1/links/:id                     # Archive link

GET    /api/v1/links/:id/stats               # Aggregated stats
GET    /api/v1/links/:id/clicks              # Paginated click log
GET    /api/v1/links/:id/clicks/export       # CSV export
GET    /api/v1/links/:id/history             # Destination change history

GET    /api/v1/links/:id/routing             # Get smart routing rules
POST   /api/v1/links/:id/routing             # Add smart routing rule
PATCH  /api/v1/links/:id/routing/:ruleId     # Update rule
DELETE /api/v1/links/:id/routing/:ruleId     # Delete rule

GET    /api/v1/links/:id/pixels              # Get pixel integrations
POST   /api/v1/links/:id/pixels              # Add pixel
DELETE /api/v1/links/:id/pixels/:pixelId     # Remove pixel

GET    /api/v1/links/:id/rotator             # Get rotator entries
POST   /api/v1/links/:id/rotator             # Add rotator entry
PATCH  /api/v1/links/:id/rotator/:entryId    # Update entry
DELETE /api/v1/links/:id/rotator/:entryId    # Remove entry

GET    /api/v1/campaigns                     # List campaigns
POST   /api/v1/campaigns                     # Create campaign
GET    /api/v1/campaigns/:id/stats           # Campaign analytics

GET    /api/v1/bio                           # List bio pages
POST   /api/v1/bio                           # Create bio page
PATCH  /api/v1/bio/:id                       # Update bio page
GET    /api/v1/bio/:id/stats                 # Bio page analytics

GET    /api/v1/workspace/leaderboard         # Workspace leaderboard
GET    /api/v1/workspace/stats               # Workspace-level summary

POST   /api/webhooks/paystack                # Paystack webhook receiver
POST   /api/webhooks/stripe                  # Stripe webhook receiver
```

All API routes require `Authorization: Bearer {apiKey}` header on Business tier.
Rate limit: 1,000 requests/hour per API key.

---

## PERFORMANCE REQUIREMENTS

- Redirect endpoint (`/r/[slug]`): < 100ms P95 (for links without pixels or social preview intermediate page)
- Redirect endpoint with pixel/OG intermediate page: < 300ms P95
- Dashboard initial load: < 2 seconds
- Analytics charts: < 1 second to render after page load
- Real-time counter update latency: < 3 seconds from click to dashboard update
- QR code generation: < 500ms
- PDF report generation: < 10 seconds (show progress indicator)
- Bio page public load: < 1 second (SSR, minimal JS)
- Smart routing rule evaluation: < 5ms additional latency (rules loaded from Redis cache)

---

## SECURITY REQUIREMENTS

- All inputs sanitised and validated (use Zod for schema validation everywhere)
- CSRF protection on all mutating API routes
- Rate limit the auth endpoints: max 10 login attempts per IP per hour
- Never log or store raw IP addresses — always hash first
- API keys hashed with bcrypt before storage (only the hash is stored, not the key)
- Webhook endpoints validate signatures (Paystack: hash comparison, Stripe: `stripe.webhooks.constructEvent`)
- All external URLs (original link destinations and routing rule destinations) validated before saving
- Content Security Policy headers on all pages
- No sensitive data in URL query parameters
- Link passwords hashed with bcrypt — never stored or logged in plaintext
- Pixel intermediate page: CSP headers must allow the pixel script domains (Facebook, Google, TikTok)
- Destination history: only ADMIN and EDITOR roles can trigger changes; all changes are logged with user ID

---

## INSTRUCTIONS FOR THE AI BUILDING THIS

### Phase 0 — Foundation (do first, before any feature code)

0. **Set up the design system before writing any UI.**
   - Configure design tokens in `tailwind.config.ts` and `src/app/globals.css` per the Design Token section above
   - Install and configure Geist font in `src/app/layout.tsx`
   - Install `react-countup`, `date-fns`, `framer-motion`, `next-themes`
   - Create a `src/lib/motion.ts` file with reusable animation variants (pageVariants, cardVariants, listItemVariants, counterVariants)
   - Create `src/components/ui/` with customized versions of every shadcn component — do NOT use the default shadcn themes. Override with the Traqly design system.
   - Create base layout components: `AppShell`, `Sidebar`, `Topbar`, `PageHeader`
   - The design system must be complete and working before building any feature screens.

### Phase 1 — Backend Infrastructure

1. Start with the database schema and migrations. Get Prisma set up and all models created before writing any application code.

2. Build the redirect engine next (`/r/[slug]`). This is the core value — get it working fast and correctly, with the BullMQ async processing pipeline. Include smart routing rule evaluation and rotator logic from the start.

3. Build authentication (NextAuth) and workspace creation flow.

### Phase 2 — Core Features

4. Build the link CRUD and the basic dashboard with today's click counter. **Apply the full design system to every screen as you build it — do not defer design to the end.**

5. Build the mutable link destination feature — the update endpoint, destination history logging, Redis cache invalidation, and the History tab on the analytics page.

6. Build the aggregation system (cron jobs and stat rollup).

7. Build the analytics charts and per-link detail page (including destination change markers on the chart). Charts must match the chart design specifications exactly — gradient fills, custom tooltips, animated load.

8. Build notifications (in-app first, then email). Include the `DESTINATION_CHANGED` notification type.

9. Build leaderboards, streaks, and achievements.

### Phase 3 — Advanced Features

10. Build smart routing (Feature 20) — rule management UI and rule evaluation in the redirect engine.

11. Build retargeting pixels (Feature 21) — intermediate page, pixel firing, and per-link pixel management.

12. Build the link rotator (Feature 22) — round-robin and weighted distribution.

13. Build password-protected links (Feature 23) — the `/r/[slug]/auth` page and password verification. This page must look premium even though it is minimal.

14. Build social preview customization (Feature 24) — OG meta tag serving and the live preview UI.

15. Build the link-in-bio page builder (Feature 25) — public page (SSR), editor, and analytics.

### Phase 4 — Business & Polish

16. Build billing (Paystack integration) and plan enforcement for all new features.

17. Build the admin system health page.

18. **UI polish pass** — go through every screen and verify against the Final UI Checklist in the Design System section. Fix anything that does not meet the standard. Empty states, loading states, error states, mobile responsiveness, both dark and light mode.

19. **Motion pass** — verify Framer Motion is correctly applied on every page transition, every list render, every counter update, every modal open/close. No page should feel static.

### Testing

At each stage, write tests for the critical business logic:
- Click quality classification
- Rate limiting logic
- Bot detection
- Stat aggregation (daily/weekly rollup)
- Billing plan enforcement
- Smart routing rule evaluation (test all rule types)
- Rotator distribution correctness (round-robin and weighted)
- Destination update — cache invalidation, history logging

Use Vitest or Jest for unit tests. Use Playwright for critical E2E flows (signup, create link, update link destination, view analytics with history markers, bio page publish).

---

*This is the complete specification. Do not add features not listed here without asking first. Do not remove any feature from this list. Build everything.*

*On UI quality: if any screen does not meet the standard described in the UI/UX Design System section — if it looks generic, AI-generated, or template-like — rebuild it. Quality is non-negotiable. Traqly must look like a globally funded SaaS product.*

---

## IMPORTANT NOTES

**The redirect engine MUST stay lightweight.**

That means:
- Redirect immediately for plain links (no pixels, no OG customization)
- For links with pixels or OG customization, serve the minimal intermediate HTML page in < 300ms
- Process analytics asynchronously
- Cache aggressively — smart routing rules and rotator state in Redis
- Avoid DB calls during redirect; load everything from Redis

**Smart routing rules caching:**
Cache the full list of smart routing rules for each slug in Redis (key: `routing:{slug}`) with a TTL of 5 minutes. When rules are updated via the dashboard, immediately invalidate this key. This ensures rule changes take effect within seconds, not just at cache expiry.

**Mutable link cache invalidation:**
When `Link.originalUrl` is updated, immediately delete the Redis key `slug:{slug}`. Do not wait for natural TTL expiry. The next redirect request will re-fetch from the DB and re-cache.
