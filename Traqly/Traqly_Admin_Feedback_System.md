# Traqly — Admin Panel & Feedback System
## Major Update Specification for Claude Code
### Classification: CRITICAL — Core Infrastructure
### Priority: P0 — Build before any other feature

---

> **READ THIS FIRST — BEFORE TOUCHING A SINGLE FILE**
>
> This is the most sensitive update in the entire Traqly codebase.
> The admin panel has direct access to every user account, every subscription,
> and every piece of data in the system. A single mistake here can expose user
> data, corrupt the database, or allow unauthorized access.
>
> Follow every instruction in exact order.
> Do not skip steps.
> Do not improvise.
> Run `npm run build` after every major section.
> Test every route locally before pushing to Vercel.
> If you are unsure about anything — stop and ask before proceeding.

---

## PART 0 — ARCHITECTURE OVERVIEW

### What This Update Builds

1. **Founder Account Privileges** — The owner's account gets permanent Business
   plan access and an `isAdmin` flag that bypasses all plan limits forever.

2. **Admin Authentication Layer** — A separate, hardened authentication check
   that wraps every admin route. If this check fails, the request is rejected
   with a 403 — no exceptions, no fallbacks.

3. **Admin Dashboard** (`/admin`) — A private control center visible only to
   the founder. Shows real-time platform health, user metrics, revenue, alerts.

4. **User Management** (`/admin/users`) — Full visibility into every registered
   user. View, search, filter, manually upgrade/downgrade plans, ban accounts,
   and impersonate any user for debugging.

5. **Subscription & Revenue** (`/admin/revenue`) — Complete billing intelligence.
   MRR, churn, failed payments, active subscribers, Paystack transaction history.

6. **Content Moderation** (`/admin/content`) — See all links, social links, QR
   codes, and bio pages across the platform. Flag, pause, or delete abusive content.

7. **Feedback Inbox** (`/admin/feedback`) — All user feedback organized by
   category, priority, and date. Powered by Claude AI for intelligent conversation.

8. **System Health** (`/admin/system`) — Database stats, API performance, error
   rates, cron job status, and Vercel deployment info.

9. **Floating Feedback Widget** — Appears on every dashboard page for all users.
   Powered by Claude API. Routes conversations to the admin inbox.

10. **Founder Sidebar Item** — A locked "Admin" entry in the sidebar, only
    visible when `user.isAdmin === true`.

---

## PART 1 — DATABASE SCHEMA UPDATES

### 1.1 — Update the User Model

Open `prisma/schema.prisma`. Add these fields to the existing User model.
Do NOT remove any existing fields — only ADD:

```prisma
model User {
  // ... all existing fields stay exactly as they are ...

  // NEW ADMIN FIELDS — ADD THESE:
  isAdmin               Boolean   @default(false)
  isBanned              Boolean   @default(false)
  bannedAt              DateTime?
  bannedReason          String?
  planOverride          Boolean   @default(false)
  planOverrideNote      String?
  lastActiveAt          DateTime?
  adminNotes            String?

  // NEW RELATIONS — ADD THESE:
  feedbackSessions      FeedbackSession[]
  adminActionsReceived  AdminActionLog[]  @relation("TargetUser")
  adminActionsPerformed AdminActionLog[]  @relation("AdminUser")
}
```

### 1.2 — Add FeedbackSession Model

```prisma
model FeedbackSession {
  id             String   @id @default(cuid())
  userId         String
  userEmail      String
  userName       String?
  userPlan       String   @default("FREE")
  status         String   @default("open")
  category       String?
  priority       String   @default("normal")
  sentiment      String?
  summary        String?
  resolvedAt     DateTime?
  resolvedBy     String?
  resolutionNote String?
  pageContext    String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  messages       FeedbackMessage[]
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([status])
  @@index([priority])
  @@index([createdAt])
}

model FeedbackMessage {
  id        String   @id @default(cuid())
  sessionId String
  role      String
  content   String   @db.Text
  createdAt DateTime @default(now())

  session   FeedbackSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId])
}
```

### 1.3 — Add AdminActionLog Model

Every admin action must be logged. This is non-negotiable.

```prisma
model AdminActionLog {
  id           String   @id @default(cuid())
  adminId      String
  targetUserId String?
  action       String
  details      String?  @db.Text
  ipAddress    String?
  createdAt    DateTime @default(now())

  admin        User     @relation("AdminUser", fields: [adminId], references: [id])
  targetUser   User?    @relation("TargetUser", fields: [targetUserId], references: [id])

  @@index([adminId])
  @@index([targetUserId])
  @@index([action])
  @@index([createdAt])
}
```

### 1.4 — Add SystemAlert Model

```prisma
model SystemAlert {
  id         String   @id @default(cuid())
  type       String
  title      String
  message    String   @db.Text
  source     String?
  isRead     Boolean  @default(false)
  resolvedAt DateTime?
  createdAt  DateTime @default(now())

  @@index([isRead])
  @@index([createdAt])
}
```

### 1.5 — Run Migration

```bash
npx prisma db push
npx prisma generate
npx prisma studio
```

Verify in Prisma Studio that all 4 new tables exist before continuing:
FeedbackSession, FeedbackMessage, AdminActionLog, SystemAlert.
If any table is missing — stop here and fix the schema.

---

## PART 2 — FOUNDER ACCOUNT SETUP

### 2.1 — Create setup script

Create `scripts/setup-admin.ts`:

```typescript
import { PrismaClient } from '@/app/generated/prisma/client'

const db = new PrismaClient()

async function setupAdmin() {
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'princeamadin25@gmail.com'

  const user = await db.user.findUnique({ where: { email: ADMIN_EMAIL } })

  if (!user) {
    console.error(`User ${ADMIN_EMAIL} not found. Log in once before running this.`)
    process.exit(1)
  }

  await db.user.update({
    where: { email: ADMIN_EMAIL },
    data: {
      isAdmin: true,
      plan: 'BUSINESS',
      planOverride: true,
      planOverrideNote: 'Founder account — permanent Business access',
      planExpiresAt: new Date('2099-12-31'),
    }
  })

  console.log(`Admin setup complete for ${ADMIN_EMAIL}`)
  console.log('isAdmin: true | plan: BUSINESS | expires: never')
  await db.$disconnect()
}

setupAdmin().catch(console.error)
```

Run it:
```bash
npx ts-node --project tsconfig.json scripts/setup-admin.ts
```

### 2.2 — Add environment variables

Add to `.env` AND Vercel environment variables:
```
ADMIN_EMAIL="princeamadin25@gmail.com"
ADMIN_SECRET="[generate from generate-secret.vercel.app/32]"
ANTHROPIC_API_KEY="sk-ant-[your key from console.anthropic.com]"
```

---

## PART 3 — ADMIN AUTHENTICATION LAYER

### 3.1 — Create `lib/admin-auth.ts`

```typescript
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export type AdminAuthResult =
  | { authorized: true; adminUser: { id: string; email: string; name: string | null } }
  | { authorized: false; response: NextResponse }

export async function requireAdmin(request?: NextRequest): Promise<AdminAuthResult> {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return { authorized: false, response: NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }) }
    }

    const adminEmail = process.env.ADMIN_EMAIL
    if (!adminEmail) {
      console.error('[ADMIN] CRITICAL: ADMIN_EMAIL not set')
      return { authorized: false, response: NextResponse.json({ error: 'Server error' }, { status: 500 }) }
    }

    if (session.user.email !== adminEmail) {
      console.warn(`[ADMIN] Rejected: ${session.user.email}`)
      return { authorized: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }

    const dbUser = await db.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, name: true, isAdmin: true, isBanned: true }
    })

    if (!dbUser || !dbUser.isAdmin) {
      return { authorized: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }

    if (dbUser.isBanned) {
      return { authorized: false, response: NextResponse.json({ error: 'Account suspended' }, { status: 403 }) }
    }

    return { authorized: true, adminUser: { id: dbUser.id, email: dbUser.email!, name: dbUser.name } }

  } catch (error) {
    console.error('[ADMIN AUTH] Error:', error)
    return { authorized: false, response: NextResponse.json({ error: 'Server error' }, { status: 500 }) }
  }
}

export async function logAdminAction({
  adminId,
  targetUserId,
  action,
  details,
  request
}: {
  adminId: string
  targetUserId?: string
  action: string
  details?: Record<string, unknown>
  request?: NextRequest
}) {
  try {
    await db.adminActionLog.create({
      data: {
        adminId,
        targetUserId,
        action,
        details: details ? JSON.stringify(details) : null,
        ipAddress: request?.headers.get('x-forwarded-for') || 'unknown'
      }
    })
  } catch (error) {
    console.error('[ADMIN LOG] Failed:', error)
  }
}
```

### 3.2 — Create `app/api/admin/verify/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (!authResult.authorized) return authResult.response
  return NextResponse.json({ authorized: true, admin: authResult.adminUser })
}
```

### 3.3 — Create `hooks/use-admin-auth.ts`

```typescript
'use client'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export function useAdminAuth() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [isVerified, setIsVerified] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') {
      router.replace('/auth/login?callbackUrl=/admin')
      return
    }

    fetch('/api/admin/verify')
      .then(res => {
        if (res.ok) setIsVerified(true)
        else router.replace('/dashboard')
      })
      .catch(() => router.replace('/dashboard'))
      .finally(() => setIsChecking(false))
  }, [status, router])

  return { isVerified, isChecking, session }
}
```

### 3.4 — Update `auth.ts` to include isAdmin in session

In `auth.ts`, update the session and JWT callbacks:

```typescript
callbacks: {
  jwt: async ({ token, user }) => {
    if (user) {
      token.sub = user.id
      const dbUser = await db.user.findUnique({
        where: { id: user.id },
        select: { isAdmin: true }
      })
      token.isAdmin = dbUser?.isAdmin ?? false
    }
    return token
  },
  session: async ({ session, token }) => {
    if (session.user) {
      session.user.id = token.sub!
      session.user.isAdmin = token.isAdmin as boolean ?? false
    }
    return session
  }
}
```

### 3.5 — Update `types/next-auth.d.ts`

Create this file if it doesn't exist:

```typescript
import 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
      isAdmin: boolean
    }
  }
}
```

---

## PART 4 — ADMIN LAYOUT

### 4.1 — Create `app/(dashboard)/admin/layout.tsx`

```tsx
'use client'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { Shield, AlertTriangle } from 'lucide-react'
import { motion } from 'framer-motion'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isVerified, isChecking } = useAdminAuth()

  if (isChecking) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-2 border-brand border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-secondary text-sm">Verifying admin access...</p>
        </div>
      </div>
    )
  }

  if (!isVerified) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-danger mx-auto mb-4" />
          <p className="text-primary font-semibold">Access Denied</p>
          <p className="text-secondary text-sm mt-1">Admin privileges required.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <motion.div
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2"
      >
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <p className="text-amber-400 text-xs font-medium">
            ADMIN MODE — Actions here affect real users and real data. Proceed carefully.
          </p>
        </div>
      </motion.div>
      <div className="max-w-7xl mx-auto px-6 py-8">{children}</div>
    </div>
  )
}
```

### 4.2 — Add Admin to Sidebar

In `components/layout/sidebar.tsx`, find where nav items are rendered.
Add this block, visible ONLY when `user?.isAdmin === true`:

```tsx
{user?.isAdmin && (
  <div className="px-3 mb-2">
    <p className="text-xs font-semibold text-muted uppercase tracking-widest px-3 mb-2">Admin</p>
    <Link
      href="/admin"
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
        pathname.startsWith('/admin')
          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
          : 'text-secondary hover:text-primary hover:bg-surface-overlay'
      }`}
    >
      <Shield className="w-4 h-4" />
      Admin Panel
      <span className="ml-auto text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full font-medium">
        Owner
      </span>
    </Link>
  </div>
)}
```

---

## PART 5 — ADMIN DASHBOARD PAGE

### 5.1 — Create `app/api/admin/stats/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (!authResult.authorized) return authResult.response

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const [
    totalUsers, newThisMonth, newThisWeek, bannedUsers,
    freeUsers, growthUsers, businessUsers,
    activeSubscriptions, totalLinks, totalClicks,
    clicksToday, clicksThisWeek,
    openFeedback, criticalFeedback,
    recentSignups, recentFeedback
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    db.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    db.user.count({ where: { isBanned: true } }),
    db.user.count({ where: { plan: 'FREE' } }),
    db.user.count({ where: { plan: 'GROWTH' } }),
    db.user.count({ where: { plan: 'BUSINESS' } }),
    db.subscription.count({ where: { status: 'active' } }),
    db.link.count(),
    db.clickEvent.count(),
    db.clickEvent.count({ where: { timestamp: { gte: todayStart } } }),
    db.clickEvent.count({ where: { timestamp: { gte: sevenDaysAgo } } }),
    db.feedbackSession.count({ where: { status: 'open' } }),
    db.feedbackSession.count({ where: { status: 'open', priority: 'critical' } }),
    db.user.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, name: true, plan: true, createdAt: true }
    }),
    db.feedbackSession.findMany({
      take: 5,
      where: { status: 'open' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, userEmail: true, category: true, priority: true, summary: true, createdAt: true }
    })
  ])

  const activeGrowthMonthly = await db.subscription.count({ where: { status: 'active', plan: 'GROWTH', billingCycle: 'monthly' } })
  const activeGrowthYearly = await db.subscription.count({ where: { status: 'active', plan: 'GROWTH', billingCycle: 'yearly' } })
  const activeBusinessMonthly = await db.subscription.count({ where: { status: 'active', plan: 'BUSINESS', billingCycle: 'monthly' } })
  const activeBusinessYearly = await db.subscription.count({ where: { status: 'active', plan: 'BUSINESS', billingCycle: 'yearly' } })

  const mrr = (activeGrowthMonthly * 5000) + (activeGrowthYearly * 4000) + (activeBusinessMonthly * 15000) + (activeBusinessYearly * 12000)

  return NextResponse.json({
    users: { total: totalUsers, newThisMonth, newThisWeek, banned: bannedUsers, byPlan: { free: freeUsers, growth: growthUsers, business: businessUsers } },
    subscriptions: { total: activeSubscriptions, mrr, arr: mrr * 12 },
    content: { totalLinks },
    clicks: { total: totalClicks, today: clicksToday, thisWeek: clicksThisWeek },
    feedback: { open: openFeedback, critical: criticalFeedback },
    recent: { signups: recentSignups, feedback: recentFeedback }
  })
}
```

### 5.2 — Create `app/(dashboard)/admin/page.tsx`

Build a full dashboard page that:
- Fetches from `/api/admin/stats` on load and every 60 seconds
- Shows skeleton loaders while loading
- Shows a red critical alert banner if `feedback.critical > 0`
- Shows 4 large stat cards: Total Users, Monthly Revenue (in Naira), Active Subscribers, Open Feedback
- Shows 4 smaller stat cards: Total Links, Clicks Today, This Week Unique, Banned Accounts
- Shows plan distribution bars: Free / Growth / Business with percentage of total users
- Shows "Recent Signups" table with avatar, name, email, plan badge, join date
- Shows "Recent Feedback" list with priority dot, summary, email, category
- Shows "Admin Sections" quick nav grid: User Management, Revenue, Feedback, Content, System Health, Audit Log
- Has a Refresh button that manually re-fetches
- All stat cards link to their respective admin section
- Uses Framer Motion for staggered entrance animations

---

## PART 6 — USER MANAGEMENT

### 6.1 — Create `app/api/admin/users/route.ts`

GET handler with query params: `page`, `limit`, `search`, `plan`, `status`, `sortBy`, `sortOrder`

- `search` filters by email OR name (case insensitive)
- `plan` filters by FREE/GROWTH/BUSINESS
- `status` filters by banned/active
- Returns paginated results with user fields: id, email, name, image, plan, isAdmin, isBanned, bannedReason, planOverride, createdAt, lastActiveAt, planExpiresAt, billingCycle, link count

### 6.2 — Create `app/api/admin/users/[id]/route.ts`

GET: Returns full user profile including recent links, subscriptions, feedback sessions, admin action logs targeting this user, and total click count across all their links.

PATCH: Accepts `action` field and performs one of these operations:
- `set_plan` with `value` (FREE/GROWTH/BUSINESS) and `note` — updates plan, sets planOverride true, sets planExpiresAt to 2099 for paid plans
- `ban` with `reason` — sets isBanned true, bannedAt, bannedReason
- `unban` — clears ban fields
- `set_admin` — sets isAdmin true
- `remove_admin` — sets isAdmin false
- `set_note` with `value` — updates adminNotes

After every PATCH, call `logAdminAction()` with the action name and before/after details.
Block any action that targets the admin's own account (prevent self-lockout).

### 6.3 — Create `app/(dashboard)/admin/users/page.tsx`

Full user management page with:
- Search input (debounced 300ms) filtering by name/email
- Filter pills: All | Free | Growth | Business | Banned
- Sort dropdown: Newest | Oldest | Most Links | Last Active
- Table columns: Avatar+Name+Email | Plan | Links | Joined | Last Active | Actions
- Actions dropdown per row: View Profile | Change Plan | Ban/Unban | Add Note
- Pagination (20 per page) with page numbers
- "Export CSV" button that downloads all users matching current filters
- Loading skeleton for the table

### 6.4 — Create `app/(dashboard)/admin/users/[id]/page.tsx`

Individual user profile with:
- Large header: avatar, name, email, join date, plan badge (with "Admin Override" tag if planOverride is true)
- Quick action bar: "Change Plan" | "Ban Account" | "Add Note" | "View as User"
- 4 stat cards: Links Created | Total Clicks Generated | Feedback Sessions | Days Since Joined
- Tabs: Overview | Links | Subscriptions | Feedback | Admin Log

**Overview tab:** Plan history note, account details, editable admin notes textarea (saves on blur)

**Links tab:** Table of all links this user created, with slug, destination URL (truncated), click count, created date, status badge, link to full analytics

**Subscriptions tab:** Paystack subscription history — plan, billing cycle, amount, status, start date, end date

**Feedback tab:** All feedback sessions from this user — category badge, priority badge, first message preview, date, status

**Admin Log tab:** All admin actions targeting this user — action type, who did it, when, details

**Change Plan Modal:**
```
Modal title: "Change Plan for [user name]"
Shows current plan with "Admin Override" indicator if applicable

Radio buttons:
  ○ Free — Remove paid access
  ○ Growth — ₦5,000/mo equivalent  
  ○ Business — ₦15,000/mo equivalent

Reason field (required, min 10 chars):
  [text area]

Admin note (optional, only you see this):
  [text area]

Buttons: [Cancel] [Save Plan Change]
```

**Ban Account Modal:**
```
Modal title: "Ban [user name]?"
Warning: "This prevents login but keeps all data. Reversible."

Reason category (required):
  ○ Spam links
  ○ Platform abuse
  ○ Payment fraud
  ○ Terms violation
  ○ Other: [text input]

Buttons: [Cancel] [Ban Account] (danger red)
```

---

## PART 7 — REVENUE PAGE

### 7.1 — Create `app/api/admin/revenue/route.ts`

Returns:
- MRR and ARR calculated from active subscriptions
- Active subscription count broken down by plan and cycle
- New subscriptions this month
- Cancelled subscriptions this month (churn)
- Churn rate percentage
- Failed payments this month
- Full list of active subscriptions with user info joined

### 7.2 — Create `app/(dashboard)/admin/revenue/page.tsx`

Revenue dashboard with:
- 5 stat cards: MRR (in Naira, large) | ARR | Active Subscribers | New This Month | Churn Rate
- Red alert card if failedPayments > 0
- Plan breakdown grid: Growth Monthly count | Growth Yearly count | Business Monthly | Business Yearly
- Full subscriptions table: User email | Plan | Cycle | Monthly equivalent | Status | Next billing date | Start date
- Filter by plan and cycle
- "Export to CSV" button

---

## PART 8 — FEEDBACK SYSTEM

### 8.1 — Install Anthropic SDK

```bash
npm install @anthropic-ai/sdk
```

### 8.2 — Create `app/api/feedback/route.ts`

This is the USER-FACING endpoint (not in the admin folder).

System prompt for Claude:
```
You are Traqly's friendly support assistant for an African link analytics platform.

Traqly features: Link Shortener, Social Links (WhatsApp/Telegram/Instagram etc with pre-filled messages), QR & Barcode Studio, Smart Share tracking, Real-time Analytics, Fraud Protection, Bio Pages, Campaigns, Goals.

Your role:
1. Warmly collect bug reports, feature requests, and general feedback
2. For bugs: ask what page they were on, what they expected, what happened
3. For features: ask how critical it is to their business (1-5)
4. Keep responses to 2-3 sentences maximum
5. Do NOT answer off-topic questions

At the end of every response, include this JSON on its own line:
{"category":"bug|feature_request|question|praise|other","priority":"low|normal|high|critical","sentiment":"positive|neutral|negative"}
```

Logic:
1. Verify user is authenticated (return 401 if not)
2. Get or create a FeedbackSession for this user
3. Save the user's message to FeedbackMessage
4. Fetch full conversation history from database
5. Call Claude API with full history and system prompt
6. Extract JSON metadata from Claude's response
7. Clean response (remove JSON block) before sending to user
8. Save Claude's full response (with JSON) to FeedbackMessage
9. Update FeedbackSession with category, priority, sentiment
10. If priority is "critical", send email to ADMIN_EMAIL via Resend
11. Return cleaned message and sessionId to client

### 8.3 — Create `app/api/admin/feedback/route.ts`

GET with filters: status (open/resolved/all), priority, category, page
Returns paginated feedback sessions with first message included
Orders by: critical first, then by createdAt desc

### 8.4 — Create `app/api/admin/feedback/[id]/route.ts`

GET: Full session with all messages, user profile joined
PATCH: Update status, priority, category, resolutionNote, summary. On status=resolved, set resolvedAt and resolvedBy.

### 8.5 — Create `components/feedback/feedback-widget.tsx`

Floating chat widget with:

**Toggle button:** 48px circle, brand color when closed, surface-elevated when open. Ping animation every 45 seconds. MessageCircle icon when closed, ChevronDown when open. Smooth icon swap animation.

**Tooltip bubble:** Appears near button during ping — "Got feedback? 💬 We're listening". Framer Motion fade+slide animation. Disappears after 3 seconds.

**Chat window:** 380px wide, slides up with scale animation. Shows above the toggle button.

Header: Traqly logo + "Traqly Feedback" + green pulse dot + "We read every message"

Message area: 320px tall, scrollable. User messages: right-aligned, brand color bubble. Assistant messages: left-aligned, surface-overlay bubble. Typing indicator: 3 bouncing dots.

Input area: Textarea that auto-expands up to 100px. Send button (brand color). "Enter to send · Shift+Enter for new line" hint.

Initial greeting on first open: "Hi [FirstName] 👋 I'm here to help with any feedback or questions about Traqly. Found a bug? Have a feature idea? Just let me know."

State management:
- `messages`: array of {role, content, timestamp}
- `sessionId`: string or null (created on first message)
- `isLoading`: boolean (shows typing indicator)
- `isOpen`: boolean
- `showPulse`: boolean (triggers the ping animation)

Do NOT show the widget on: `/auth/*`, `/admin/*`, or when user is not logged in.

Add the widget to `app/(dashboard)/layout.tsx` — wrapping the children.

### 8.6 — Create `app/(dashboard)/admin/feedback/page.tsx`

Admin feedback inbox with:
- Tab bar: Open | Resolved | Archived | All
- Secondary filters: All Priorities | Critical | High | Normal | Low
- Category filter: All | Bug | Feature | Question | Praise | Other
- Each feedback card shows:
  - Left colored border (red=critical, amber=high, gray=normal)
  - User email + plan badge
  - Category badge + Priority badge
  - First message preview (2 lines max)
  - Timestamp + message count
- Critical items pinned to top with red left border
- Empty state per filter
- Clicking a card navigates to `/admin/feedback/[id]`

### 8.7 — Create `app/(dashboard)/admin/feedback/[id]/page.tsx`

Full conversation view with:
- Left panel (65%): Full chat transcript in message bubbles. User messages right-aligned brand color. Assistant messages left-aligned. Each message shows timestamp on hover.
- Right panel (35%): 
  - User info card: avatar, email, plan, join date, total links
  - Status selector: Open | Resolved | Archived
  - Priority selector: Low | Normal | High | Critical
  - Category selector: Bug | Feature | Question | Praise | Other
  - Resolution notes textarea (saves on blur)
  - "Email User" button (opens mailto link)
  - "View User Profile" link to `/admin/users/[userId]`
- Back button returns to `/admin/feedback`

---

## PART 9 — CONTENT MODERATION

### 9.1 — Create `app/api/admin/content/route.ts`

GET with params: `type` (links/social/qr/bio), `page`, `search`, `status`

Returns paginated content items with owner's email joined.

PATCH: `action` = pause | unpause
DELETE: Permanently deletes the item. Require `confirm=true` in body.

### 9.2 — Create `app/(dashboard)/admin/content/page.tsx`

Tab-based content moderation:

**All Links tab:** Table with slug, destination URL (truncated, hover shows full), owner email, created date, click count, status badge (Active/Paused/Expired). Search by URL or slug. Actions: View Analytics | Pause | Delete.

**Social Links tab:** Same table filtered to social link type, shows platform badge.

**QR Codes tab:** Shows type, created by, scan count, actions.

**Bio Pages tab:** Shows slug, owner, link count.

**Delete confirmation:** Modal asking user to type "DELETE" to confirm. Show what will be deleted. Show that analytics history will also be lost.

---

## PART 10 — SYSTEM HEALTH PAGE

### 10.1 — Create `app/api/admin/system/route.ts`

Returns:
- Record counts for: users, links, clickEvents, subscriptions, feedbackSessions, adminActionLogs
- Recent SystemAlert records (last 10, unresolved first)
- Most recent AdminActionLog entry
- Node.js version and Next.js version
- Current time (to verify server timezone)

### 10.2 — Create `app/(dashboard)/admin/system/page.tsx`

System health dashboard with:

**Database Records section:** Cards showing count for each major table.

**Recent Alerts section:** List of SystemAlert records with type badge (error=red, warning=amber, info=blue), title, message, timestamp. "Mark resolved" button per alert.

**Admin Activity section:** Shows last admin action with who did it and when.

**Environment Check section:** Shows whether required env vars are set (TRUE/FALSE, never showing actual values): ADMIN_EMAIL, ANTHROPIC_API_KEY, PAYSTACK_SECRET_KEY, RESEND_API_KEY, DATABASE_URL, NEXTAUTH_SECRET.

---

## PART 11 — AUDIT LOG PAGE

### 11.1 — Create `app/api/admin/audit/route.ts`

GET with params: `page`, `action` filter
Returns paginated AdminActionLog with admin and targetUser joined.

### 11.2 — Create `app/(dashboard)/admin/audit/page.tsx`

Audit log table with:
- Timestamp
- Admin who performed action (always you, but structured for future multi-admin)
- Action type with color-coded badge: plan changes=blue, bans=red, unbans=green, notes=gray, impersonation=amber
- Target user email (clickable, links to their profile)
- Details (collapsible JSON viewer showing before/after values)
- Filter by action type dropdown

---

## PART 12 — IMPERSONATION FEATURE

### 12.1 — Create `app/api/admin/impersonate/route.ts`

POST with `userId`:
- Verify admin auth
- Refuse if userId === adminId (can't impersonate self)
- Refuse if target user is also admin
- Log the impersonation action
- Return a cookie or session token that temporarily sets the viewed user
- Set a 15-minute expiry

### 12.2 — Impersonation Banner

Create `components/admin/impersonation-banner.tsx`:
- Fixed position at top of screen, full width, amber background
- "ADMIN VIEW — Viewing as [email]"
- "Exit View" button that clears the impersonation state
- This banner appears ONLY during active impersonation

Add impersonation detection to the root layout. When impersonation is active, show the banner at the very top of the page above everything else.

---

## PART 13 — SECURITY HARDENING

### 13.1 — Add security headers in `next.config.ts`

```typescript
async headers() {
  return [
    {
      source: '/admin/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Cache-Control', value: 'no-store, no-cache' },
        { key: 'Referrer-Policy', value: 'strict-origin' }
      ]
    }
  ]
}
```

### 13.2 — Protect admin routes in middleware

In `middleware.ts`, add protection for `/admin` routes. If request is to `/admin/*` and there is no valid session, redirect to `/auth/login`. The full admin check is handled by `requireAdmin()` in each route — middleware just ensures basic auth first.

### 13.3 — Rate limiting on admin API routes

Add rate limiting to all admin API routes. Max 200 admin API requests per 5-minute window per IP. If exceeded, return 429 Too Many Requests. Use an in-memory Map for rate limit tracking (sufficient for single-admin use).

---

## PART 14 — COMPLETE BUILD CHECKLIST

Run through every item before pushing to Vercel:

### Database:
- [ ] FeedbackSession table created
- [ ] FeedbackMessage table created  
- [ ] AdminActionLog table created
- [ ] SystemAlert table created
- [ ] User model has isAdmin, isBanned, bannedAt, bannedReason, planOverride, planOverrideNote, lastActiveAt, adminNotes fields
- [ ] `npx prisma db push` ran without errors
- [ ] `npx prisma generate` ran without errors
- [ ] Prisma Studio confirms all tables exist

### Auth:
- [ ] `types/next-auth.d.ts` has isAdmin on Session
- [ ] `auth.ts` JWT callback writes isAdmin to token
- [ ] `auth.ts` session callback writes isAdmin to session.user

### Files created:
- [ ] `scripts/setup-admin.ts`
- [ ] `lib/admin-auth.ts`
- [ ] `hooks/use-admin-auth.ts`
- [ ] `app/api/admin/verify/route.ts`
- [ ] `app/api/admin/stats/route.ts`
- [ ] `app/api/admin/users/route.ts`
- [ ] `app/api/admin/users/[id]/route.ts`
- [ ] `app/api/admin/revenue/route.ts`
- [ ] `app/api/admin/feedback/route.ts`
- [ ] `app/api/admin/feedback/[id]/route.ts`
- [ ] `app/api/admin/content/route.ts`
- [ ] `app/api/admin/system/route.ts`
- [ ] `app/api/admin/audit/route.ts`
- [ ] `app/api/admin/impersonate/route.ts`
- [ ] `app/api/feedback/route.ts` (user-facing — NOT in admin folder)
- [ ] `app/(dashboard)/admin/layout.tsx`
- [ ] `app/(dashboard)/admin/page.tsx`
- [ ] `app/(dashboard)/admin/users/page.tsx`
- [ ] `app/(dashboard)/admin/users/[id]/page.tsx`
- [ ] `app/(dashboard)/admin/revenue/page.tsx`
- [ ] `app/(dashboard)/admin/feedback/page.tsx`
- [ ] `app/(dashboard)/admin/feedback/[id]/page.tsx`
- [ ] `app/(dashboard)/admin/content/page.tsx`
- [ ] `app/(dashboard)/admin/system/page.tsx`
- [ ] `app/(dashboard)/admin/audit/page.tsx`
- [ ] `components/feedback/feedback-widget.tsx`
- [ ] `components/admin/impersonation-banner.tsx`

### Wiring:
- [ ] Sidebar shows "Admin Panel" link only when `user.isAdmin === true`
- [ ] FeedbackWidget imported and rendered in `app/(dashboard)/layout.tsx`
- [ ] ImpersonationBanner wired to root layout
- [ ] Security headers added to `next.config.ts`
- [ ] Admin routes protected in `middleware.ts`

### Environment:
- [ ] ADMIN_EMAIL set in `.env` and Vercel
- [ ] ADMIN_SECRET set in `.env` and Vercel
- [ ] ANTHROPIC_API_KEY set in `.env` and Vercel
- [ ] `@anthropic-ai/sdk` installed (`npm install @anthropic-ai/sdk`)

### Local testing sequence:
1. Run `npm run dev`
2. Run `npx ts-node scripts/setup-admin.ts`
3. Verify account has isAdmin=true in Prisma Studio
4. Log in — verify "Admin Panel" appears in sidebar
5. Visit `/admin` — verify dashboard loads with real stats
6. Visit `/admin/users` — verify user list appears
7. Click your own account — verify profile loads
8. Try to ban your own account — verify it errors correctly
9. Create a second test account, find it in users list
10. Change that account's plan — verify it saves and logs
11. Visit `/admin/feedback` — verify it loads
12. Open feedback widget on dashboard — verify chat opens
13. Send 3 messages — verify they appear in `/admin/feedback`
14. Mark the feedback session as resolved — verify it moves to Resolved tab
15. Visit `/admin/revenue` — verify it loads
16. Visit `/admin/system` — verify all env var checks show correctly
17. Visit `/admin/audit` — verify the plan change from step 10 is logged
18. Run `npm run build` — verify ZERO errors

### Deploy:
```bash
git add .
git commit -m "Add complete admin panel, user management, revenue dashboard, content moderation, Claude AI feedback system, audit log, and impersonation"
git push
```

After deploy:
1. Visit `traqly.vercel.app/admin` — verify it loads
2. Test feedback widget on live site
3. Send a test critical message — verify email alert arrives
4. Confirm your account shows Business plan and Admin badge

---

## CRITICAL RULES FOR CLAUDE CODE

1. **EVERY admin API route must start with `requireAdmin()`** — no exceptions ever.

2. **EVERY admin action must call `logAdminAction()`** — no exceptions ever.

3. **NEVER show actual secret values** in the system health page — only show TRUE/FALSE for whether they are set.

4. **NEVER allow an admin to ban or downgrade themselves** — always check `targetUserId !== adminUser.id`.

5. **NEVER allow impersonating another admin account** — always check `targetUser.isAdmin === false`.

6. **The Anthropic API key is server-only** — `@anthropic-ai/sdk` must NEVER be imported in any file with `'use client'`.

7. **Build incrementally and test each section** — do not build everything at once. Schema → Auth → Layout → Dashboard → Users → Feedback Widget → Admin Feedback → Revenue → Content → System → Audit.

8. **If `npm run build` fails after any section** — stop immediately and fix before proceeding.

9. **If a Prisma migration fails** — stop immediately and do not attempt workarounds. Report the exact error.

10. **Run the setup-admin script before testing** — the admin panel is useless without it.
