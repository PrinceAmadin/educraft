# Traqly — Master AI Build Prompt
### Copy this entire document and paste it into your AI coding assistant (Claude Code, Cursor, GPT-4o, etc.)

---

## ROLE & MISSION

You are a senior full-stack engineer and product designer. Your job is to build **Traqly** — a production-grade link tracking and analytics platform built specifically for small and medium-scale business owners (SMBs) in Africa and beyond.

This is not a demo. Build it as if it is going live to real paying users. Every feature must be fully functional, tested, and polished. Do not use placeholder data, mock APIs, or "coming soon" screens unless explicitly told to. Write real code, real database schemas, real business logic.

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

**Target user**: A Nigerian or African entrepreneur running 1–3 businesses, sharing links via WhatsApp, Instagram, Facebook, and TikTok, and making business decisions based on what's getting attention.

---

## TECH STACK

Use this exact stack unless a component is unavailable:

### Frontend
- **Framework**: Next.js 14+ (App Router)
- **Styling**: Tailwind CSS + shadcn/ui components
- **Charts**: Recharts
- **Real-time**: Socket.io client (or Server-Sent Events)
- **State**: Zustand for global state, React Query (TanStack) for server state
- **Icons**: Lucide React
- **Animations**: Framer Motion for key transitions
- **PWA**: next-pwa for installability on mobile

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
  id              String    @id @default(cuid())
  workspaceId     String
  campaignId      String?
  originalUrl     String
  slug            String    @unique  // the short code
  title           String?
  description     String?
  tags            String[]
  isActive        Boolean   @default(true)
  expiresAt       DateTime?
  clickGoal       Int?      // target clicks
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  workspace       Workspace @relation(fields: [workspaceId], references: [id])
  campaign        Campaign? @relation(fields: [campaignId], references: [id])
  clicks          ClickEvent[]
  dailyStats      DailyStat[]
  weeklyStats     WeeklyStat[]
  monthlyStat     MonthlyStat[]
  yearlyStat      YearlyStat[]
  abVariants      ABVariant[]
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
enum NotificationType { MILESTONE FRAUD_ALERT GOAL_REACHED STREAK DAILY_DIGEST SPIKE_DETECTED GOAL_REMINDER WEEKLY_REPORT }
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
- Immediately 302 redirect to destination URL — do not make the user wait
- After redirect, fire an async job to process the click event (BullMQ queue)

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
7. **Write to DB**: Insert `ClickEvent` record with all enriched fields.
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
Tabs: Overview | Traffic Sources | Geography | Devices | Quality | Raw Log

*Overview tab:*
- Real-time click counter for today
- Click trend chart (daily bars, auto-scaling based on data age — see hierarchy above)
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

*Raw log tab:*
- Paginated table of all ClickEvents for this link
- Columns: Time | Country | City | Device | OS | Browser | Source | Quality | Fraud?
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

## UI/UX REQUIREMENTS

**Design system:**
- Clean, modern SaaS aesthetic — think Linear, Vercel dashboard, or Raycast
- Dark mode support (system default, user-toggleable)
- Responsive: fully functional on mobile (many SMB owners manage via phone)
- Sidebar navigation (collapsible on mobile)
- Toast notifications for success/error actions
- Skeleton loading states on all data-fetching components
- Empty states with helpful CTAs (e.g. "You have no links yet — create your first one")
- Smooth page transitions with Framer Motion

**Key pages:**
1. `/` — Marketing landing page (explain the product, pricing, CTA to sign up)
2. `/auth/login` — Login
3. `/auth/register` — Registration
4. `/dashboard` — Main workspace dashboard
5. `/links` — Link list
6. `/links/new` — Create new link
7. `/links/[id]` — Per-link analytics
8. `/campaigns` — Campaign list and manager
9. `/leaderboard` — Leaderboard (Daily / Weekly / All-time tabs)
10. `/achievements` — All earned badges and streak display
11. `/goals` — Goal management
12. `/notifications` — Full notification centre
13. `/settings` — Account, workspace, notifications, billing
14. `/admin/system` — System health monitor (superadmin only)
15. `/r/[slug]` — Click redirect endpoint (no UI, just redirect logic)
16. `/expired` — "This link has expired" page (branded)

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
- Redirect loop detection → if destination URL resolves to the same domain as Traqly, reject at link creation
- Malformed URL at link creation → validate with `URL` constructor, reject if invalid
- Database unavailable during redirect → fall back to Redis cache; if Redis also unavailable, redirect anyway and skip analytics logging
- BullMQ worker crash → jobs are automatically retried 3 times with exponential backoff
- Failed geo lookup → store `country: "Unknown"`, do not block click recording
- Paystack/Stripe webhook fails → queue for retry, alert admin
- Email delivery failure → log, retry once after 10 minutes, log final failure

---

## API DESIGN (for Business tier and internal use)

All API routes are prefixed with `/api/v1/`.

```
GET    /api/v1/links                    # List workspace links
POST   /api/v1/links                    # Create link
GET    /api/v1/links/:id                # Get link details
PATCH  /api/v1/links/:id                # Update link
DELETE /api/v1/links/:id                # Archive link

GET    /api/v1/links/:id/stats          # Aggregated stats
GET    /api/v1/links/:id/clicks         # Paginated click log
GET    /api/v1/links/:id/clicks/export  # CSV export

GET    /api/v1/campaigns                # List campaigns
POST   /api/v1/campaigns                # Create campaign
GET    /api/v1/campaigns/:id/stats      # Campaign analytics

GET    /api/v1/workspace/leaderboard    # Workspace leaderboard
GET    /api/v1/workspace/stats          # Workspace-level summary

POST   /api/webhooks/paystack           # Paystack webhook receiver
POST   /api/webhooks/stripe             # Stripe webhook receiver
```

All API routes require `Authorization: Bearer {apiKey}` header on Business tier.
Rate limit: 1,000 requests/hour per API key.

---

## PERFORMANCE REQUIREMENTS

- Redirect endpoint (`/r/[slug]`): < 100ms P95
- Dashboard initial load: < 2 seconds
- Analytics charts: < 1 second to render after page load
- Real-time counter update latency: < 3 seconds from click to dashboard update
- QR code generation: < 500ms
- PDF report generation: < 10 seconds (show progress indicator)

---

## SECURITY REQUIREMENTS

- All inputs sanitised and validated (use Zod for schema validation everywhere)
- CSRF protection on all mutating API routes
- Rate limit the auth endpoints: max 10 login attempts per IP per hour
- Never log or store raw IP addresses — always hash first
- API keys hashed with bcrypt before storage (only the hash is stored, not the key)
- Webhook endpoints validate signatures (Paystack: hash comparison, Stripe: `stripe.webhooks.constructEvent`)
- All external URLs (original link destinations) validated before saving
- Content Security Policy headers on all pages
- No sensitive data in URL query parameters

---

## INSTRUCTIONS FOR THE AI BUILDING THIS

1. Start with the database schema and migrations. Get Prisma set up and all models created before writing any application code.

2. Build the redirect engine next (`/r/[slug]`). This is the core value — get it working fast and correctly, with the BullMQ async processing pipeline.

3. Build authentication (NextAuth) and workspace creation flow.

4. Build the link CRUD and the basic dashboard with today's click counter.

5. Build the aggregation system (cron jobs and stat rollup).

6. Build the analytics charts and per-link detail page.

7. Build notifications (in-app first, then email).

8. Build leaderboards, streaks, and achievements.

9. Build billing (Paystack integration).

10. Build the admin system health page.

11. Polish: empty states, loading states, error states, mobile responsiveness, dark mode.

At each stage, write tests for the critical business logic:
- Click quality classification
- Rate limiting logic
- Bot detection
- Stat aggregation (daily/weekly rollup)
- Billing plan enforcement

Use Vitest or Jest for unit tests. Use Playwright for critical E2E flows (signup, create link, view analytics).

---

*This is the complete specification. Do not add features not listed here without asking first. Do not remove any feature from this list. Build everything.*



NOTE:
The redirect engine MUST stay lightweight.

That means:
redirect immediately,
process analytics asynchronously,
cache aggressively,
avoid DB calls during redirect.
