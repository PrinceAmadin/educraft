# EDUCRAFT HQ — PHASE 1 BUILD PROMPT
## Role-Based Access Control (RBAC) Foundation
### Model: Claude Fable 5.1 · Effort: Max · File: EDUCRAFT_Phase1_RBAC_Build.md

---

## CONTEXT — READ BEFORE BUILDING ANYTHING

You are building on top of the existing EduCraft HQ platform at
`https://educraft-hq.vercel.app`. The foundation is working:
- Next.js 14 App Router, TypeScript, Supabase/PostgreSQL, Prisma, NextAuth,
  Tailwind, shadcn/ui
- Authentication is live. Login works at `/login`
- The existing `User` model has a `role` field typed as a Prisma enum
- Currently the only role that exists is `SUPER_ADMIN`
- The sidebar renders all tabs for every logged-in user (no role filtering yet)
- `npm run db:migrate` uses dotenv-cli with `.env.local` — use this, never
  bare `prisma migrate dev`

Your job in Phase 1 is to build the complete RBAC foundation. Everything
downstream — the Finance Platform, Ambassador Platform, Operations Platform —
depends on this being correct. Take your time. Do not rush. Read this entire
document before writing a single line of code.

---

## PHASE 1 OBJECTIVE

Enable four executive roles in EduCraft HQ. Each role sees only the tabs
belonging to their domain. The Super Admin sees everything. When a user logs
in, the system reads their role and renders only the tabs they are authorized
to see.

No executive should ever see a tab that belongs to another executive's domain.
No executive should be able to navigate to a route they do not own by typing
the URL directly.

---

## PART 1 — THE FOUR ROLES

### Role Definitions

```
SUPER_ADMIN      — Prince Amadin (CEO & Chief Product Officer)
                   Sees ALL tabs. Full access to every route.
                   The only role that can assign roles to other users.

CO_CEO_CFO       — Jubilee Abiodun (Co-CEO & Chief Financial Officer)
                   Sees: Finance domain tabs only + limited shared tabs.
                   Owns the entire financial system.

HOG              — Ayomidele Smith Oyomire (Head of Growth)
                   Sees: Ambassador and Growth domain tabs only.
                   Owns the entire ambassador and growth system.

COO              — Emmanuel Mebawondu (Chief Operating Officer)
                   Sees: Operations domain tabs only.
                   Owns the project pipeline, workers, QA, delivery.
```

### Prisma Enum Update

The existing `UserRole` enum must be extended. Update `prisma/schema.prisma`:

```prisma
enum UserRole {
  SUPER_ADMIN
  CO_CEO_CFO
  HOG
  COO
  WORKER        // existing if present — keep it
  AMBASSADOR    // existing if present — keep it
}
```

Run `npm run db:migrate` after updating the schema.

---

## PART 2 — THE TAB VISIBILITY MATRIX

This is the authoritative source of truth for what each role sees.
Build the sidebar logic exactly from this matrix. No interpretation required.

| Tab / Route | SUPER_ADMIN | CO_CEO_CFO | HOG | COO |
|---|---|---|---|---|
| Command Center `/admin` | ✅ Full | ❌ | ❌ | ❌ |
| Projects `/admin/projects` | ✅ Full | ❌ | ❌ | ✅ Full |
| QA Review `/admin/qa` | ✅ Full | ❌ | ❌ | ✅ Full |
| Research Approvals `/admin/research-requests` | ✅ Full | ❌ | ❌ | ✅ Full |
| Clients `/admin/clients` | ✅ Full | ✅ Read-only | ❌ | ✅ Read-only |
| Workers `/admin/workers` | ✅ Full | ❌ | ❌ | ✅ Full |
| Ambassadors `/admin/ambassadors` | ✅ Full | ❌ | ✅ Full | ❌ |
| Growth `/admin/growth` | ✅ Full | ❌ | ✅ Full | ❌ |
| Finance (full) `/admin/finance` | ✅ Full | ✅ Full | ❌ | ❌ |
| Finance — Payout Queue only `/admin/finance/payouts` | ✅ Full | ✅ Full | ❌ | ✅ Submit only |
| AI Usage `/admin/finance/ai-usage` | ✅ Full | ✅ Full | ❌ | ❌ |
| Reports — Finance `/admin/reports/finance` | ✅ Full | ✅ Full | ❌ | ❌ |
| Reports — Growth `/admin/reports/growth` | ✅ Full | ❌ | ✅ Full | ❌ |
| Reports — Operations `/admin/reports/operations` | ✅ Full | ❌ | ❌ | ✅ Full |
| Settings — Team & Roles `/admin/settings/team` | ✅ Full | ❌ | ❌ | ❌ |
| Settings — Services `/admin/settings/services` | ✅ Full | ❌ | ❌ | ❌ |
| Settings — Bank Details `/admin/settings/bank` | ✅ Full | ✅ Own only | ✅ Own only | ✅ Own only |

### Notes on Specific Tabs

**Clients tab:**
- `CO_CEO_CFO` and `COO` see the Clients tab but with **read-only** access.
  They cannot create, edit, or delete clients.
- `CO_CEO_CFO` needs client read access to track payments.
- `COO` needs client read access to manage project assignments.
- Implement read-only by: hiding all create/edit/delete buttons and disabling
  the corresponding API mutation routes for these roles.

**Finance — Payout Queue (`/admin/finance/payouts`):**
- `COO` can see this page specifically to submit the monthly payout list.
- `COO` cannot see the full Finance tab (revenue tracker, bucket manager,
  founder draws, expenses, reports).
- The COO's access to `/admin/finance/payouts` is restricted to submitting
  payout requests only — they cannot mark payouts as paid or modify amounts.

**Settings — Bank Details (`/admin/settings/bank`):**
- All four roles can see this page.
- Each user sees and can edit **only their own** bank details.
- `SUPER_ADMIN` can see and edit all users' bank details.

**Reports tab:**
- Reports is not one tab — it is three tabs, one per domain.
- Each role sees only their domain's report tab.
- `SUPER_ADMIN` sees all three.

**Command Center:**
- Only `SUPER_ADMIN` sees the Command Center.
- When `CO_CEO_CFO`, `HOG`, or `COO` log in, they land on their domain's
  home page (not the Command Center):
  - `CO_CEO_CFO` → `/admin/finance`
  - `HOG` → `/admin/ambassadors`
  - `COO` → `/admin/projects`

---

## PART 3 — WHAT TO BUILD

### 3.1 Database Changes

**A. Update `UserRole` enum** (described in Part 1 above).

**B. Add an `ExecProfile` table** for executive users:

```prisma
model ExecProfile {
  id          String   @id @default(cuid())
  userId      String   @unique
  user        User     @relation(fields: [userId], references: [id])
  fullName    String
  title       String   // "Co-CEO & CFO", "Head of Growth", "COO"
  email       String
  phone       String?
  bankName    String?
  accountNumber String?
  accountName String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

This table stores the executive's display name, title, and bank details. It
is separate from the `User` table so the auth system stays clean.

**C. Seed the three executive users** in `prisma/seed.ts`:

```typescript
// Add these after the existing SUPER_ADMIN seed
const executives = [
  {
    email: 'jubilee@educraft.com',  // placeholder — Prince will update
    role: 'CO_CEO_CFO',
    fullName: 'Jubilee Abiodun',
    title: 'Co-CEO & Chief Financial Officer',
  },
  {
    email: 'ayomidele@educraft.com',  // placeholder — Prince will update
    role: 'HOG',
    fullName: 'Ayomidele Smith Oyomire',
    title: 'Head of Growth',
  },
  {
    email: 'emmanuel@educraft.com',  // placeholder — Prince will update
    role: 'COO',
    fullName: 'Emmanuel Mebawondu',
    title: 'Chief Operating Officer',
  },
]
```

Seed with a default password of `EduCraft2026!` (Prince will reset after
deployment). Store the hashed password using the same method as the
existing SUPER_ADMIN seed.

### 3.2 Authentication & Session Updates

**Update `lib/auth.ts` (or wherever NextAuth is configured):**

The session must include the user's `role` so the frontend can make
authorization decisions without an additional database call.

```typescript
// In the session callback, include the role
callbacks: {
  session({ session, token }) {
    if (token.role) {
      session.user.role = token.role as UserRole
    }
    if (token.name) {
      session.user.name = token.name
    }
    return session
  },
  jwt({ token, user }) {
    if (user) {
      token.role = user.role
      token.name = user.name  // will come from ExecProfile lookup
    }
    return token
  }
}
```

**Also update the `signIn` callback** to look up the `ExecProfile` and
populate `token.name` with the exec's full name (not their email prefix).

**Update NextAuth type declarations** (`types/next-auth.d.ts` or similar):

```typescript
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: UserRole
    }
  }
}
```

### 3.3 Role-Based Login Routing

**Update the post-login redirect** in the auth configuration:

```typescript
// After successful login, redirect based on role
const roleRedirects: Record<UserRole, string> = {
  SUPER_ADMIN: '/admin',           // Command Center
  CO_CEO_CFO:  '/admin/finance',   // Finance dashboard
  HOG:         '/admin/ambassadors', // Ambassador dashboard
  COO:         '/admin/projects',  // Project pipeline
  WORKER:      '/worker',          // Worker portal (existing)
  AMBASSADOR:  '/ambassador',      // Ambassador portal (existing)
}
```

### 3.4 Route Protection Middleware

**Create or update `middleware.ts`** in the project root:

```typescript
import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

// Define which roles can access which route prefixes
const routePermissions: Record<string, UserRole[]> = {
  '/admin/finance':            ['SUPER_ADMIN', 'CO_CEO_CFO'],
  '/admin/finance/payouts':    ['SUPER_ADMIN', 'CO_CEO_CFO', 'COO'],
  '/admin/finance/ai-usage':   ['SUPER_ADMIN', 'CO_CEO_CFO'],
  '/admin/ambassadors':        ['SUPER_ADMIN', 'HOG'],
  '/admin/growth':             ['SUPER_ADMIN', 'HOG'],
  '/admin/projects':           ['SUPER_ADMIN', 'COO'],
  '/admin/qa':                 ['SUPER_ADMIN', 'COO'],
  '/admin/research-requests':  ['SUPER_ADMIN', 'COO'],
  '/admin/workers':            ['SUPER_ADMIN', 'COO'],
  '/admin/clients':            ['SUPER_ADMIN', 'CO_CEO_CFO', 'COO'],
  '/admin/reports/finance':    ['SUPER_ADMIN', 'CO_CEO_CFO'],
  '/admin/reports/growth':     ['SUPER_ADMIN', 'HOG'],
  '/admin/reports/operations': ['SUPER_ADMIN', 'COO'],
  '/admin/settings/team':      ['SUPER_ADMIN'],
  '/admin/settings/services':  ['SUPER_ADMIN'],
  '/admin/settings/bank':      ['SUPER_ADMIN', 'CO_CEO_CFO', 'HOG', 'COO'],
  '/admin':                    ['SUPER_ADMIN'],
}
```

**Route matching logic:**
- On every request to `/admin/*`, check the user's role against the
  permissions table.
- If the role is not in the allowed list for the requested route:
  redirect to the user's home route (their domain's dashboard), not to a
  generic 403 page. A silent redirect is less confusing for executives.
- `SUPER_ADMIN` bypasses all checks — they can access everything.
- If no match is found in the table, default to `SUPER_ADMIN` only
  (fail closed, not open).

**Important:** Use prefix matching for routes. `/admin/finance` should
match `/admin/finance`, `/admin/finance/payouts`,
`/admin/finance/ai-usage`, etc. Sort the permission table by specificity
(most specific routes checked first) so `/admin/finance/payouts` is
checked before `/admin/finance`.

### 3.5 Role-Based Sidebar

**The sidebar is the most visible part of this build.** Update the sidebar
component to render tabs based on the current user's role.

**Create a sidebar configuration object** (not inline JSX — a typed config):

```typescript
// lib/sidebar-config.ts

export type SidebarItem = {
  label: string
  href: string
  icon: LucideIcon
  roles: UserRole[]  // which roles can see this item
}

export type SidebarSection = {
  title: string
  items: SidebarItem[]
}

export const sidebarConfig: SidebarSection[] = [
  {
    title: 'Overview',
    items: [
      {
        label: 'Command Center',
        href: '/admin',
        icon: LayoutDashboard,
        roles: ['SUPER_ADMIN'],
      },
    ],
  },
  {
    title: 'Production',
    items: [
      {
        label: 'Projects',
        href: '/admin/projects',
        icon: FolderKanban,
        roles: ['SUPER_ADMIN', 'COO'],
      },
      {
        label: 'QA Review',
        href: '/admin/qa',
        icon: CheckSquare,
        roles: ['SUPER_ADMIN', 'COO'],
      },
      {
        label: 'Research Approvals',
        href: '/admin/research-requests',
        icon: BookSearch,
        roles: ['SUPER_ADMIN', 'COO'],
      },
      {
        label: 'Clients',
        href: '/admin/clients',
        icon: Users,
        roles: ['SUPER_ADMIN', 'CO_CEO_CFO', 'COO'],
      },
      {
        label: 'Workers',
        href: '/admin/workers',
        icon: Briefcase,
        roles: ['SUPER_ADMIN', 'COO'],
      },
    ],
  },
  {
    title: 'Growth',
    items: [
      {
        label: 'Ambassadors',
        href: '/admin/ambassadors',
        icon: Megaphone,
        roles: ['SUPER_ADMIN', 'HOG'],
      },
      {
        label: 'Growth',
        href: '/admin/growth',
        icon: TrendingUp,
        roles: ['SUPER_ADMIN', 'HOG'],
      },
    ],
  },
  {
    title: 'Finance',
    items: [
      {
        label: 'Finance',
        href: '/admin/finance',
        icon: DollarSign,
        roles: ['SUPER_ADMIN', 'CO_CEO_CFO'],
      },
      {
        label: 'Payout Queue',
        href: '/admin/finance/payouts',
        icon: CreditCard,
        roles: ['SUPER_ADMIN', 'CO_CEO_CFO', 'COO'],
      },
      {
        label: 'AI Usage',
        href: '/admin/finance/ai-usage',
        icon: Cpu,
        roles: ['SUPER_ADMIN', 'CO_CEO_CFO'],
      },
    ],
  },
  {
    title: 'Reports',
    items: [
      {
        label: 'Finance Reports',
        href: '/admin/reports/finance',
        icon: BarChart2,
        roles: ['SUPER_ADMIN', 'CO_CEO_CFO'],
      },
      {
        label: 'Growth Reports',
        href: '/admin/reports/growth',
        icon: LineChart,
        roles: ['SUPER_ADMIN', 'HOG'],
      },
      {
        label: 'Operations Reports',
        href: '/admin/reports/operations',
        icon: Activity,
        roles: ['SUPER_ADMIN', 'COO'],
      },
    ],
  },
  {
    title: 'Settings',
    items: [
      {
        label: 'Team & Roles',
        href: '/admin/settings/team',
        icon: UserCog,
        roles: ['SUPER_ADMIN'],
      },
      {
        label: 'Services',
        href: '/admin/settings/services',
        icon: Package,
        roles: ['SUPER_ADMIN'],
      },
      {
        label: 'Bank Details',
        href: '/admin/settings/bank',
        icon: Building2,
        roles: ['SUPER_ADMIN', 'CO_CEO_CFO', 'HOG', 'COO'],
      },
    ],
  },
]
```

**In the sidebar component**, filter the config by the current user's role:

```typescript
// In the sidebar component
const { data: session } = useSession()
const userRole = session?.user?.role

const visibleSections = sidebarConfig
  .map(section => ({
    ...section,
    items: section.items.filter(item => 
      item.roles.includes(userRole as UserRole)
    ),
  }))
  .filter(section => section.items.length > 0)  // hide empty sections
```

**Do not render hidden items with `display: none`** — remove them entirely
from the DOM. A hidden item in the DOM can still be found with DevTools.

### 3.6 Role Assignment — Settings > Team & Roles Page

Build the `/admin/settings/team` page. This is the page where Prince assigns
roles to executive users. Only `SUPER_ADMIN` can access it.

**Page layout:**

```
Team & Roles
─────────────────────────────────────────
EXECUTIVE MEMBERS (4 rows — one per executive including SUPER_ADMIN)

[Avatar] Prince Amadin          CEO & Chief Product Officer    SUPER_ADMIN    [Edit]
[Avatar] Jubilee Abiodun        Co-CEO & Chief Financial Officer CO_CEO_CFO  [Edit]
[Avatar] Ayomidele Smith Oyomire Head of Growth                HOG           [Edit]
[Avatar] Emmanuel Mebawondu     Chief Operating Officer        COO           [Edit]

─────────────────────────────────────────
[+ Invite Executive]  button — opens a modal

INVITED (pending)
Shows any users who have been invited but haven't accepted yet.
```

**Edit modal (for existing executives):**
- Change role (dropdown with all role options)
- Update email
- Reset password (sends a reset link)
- Remove from executive team (sets role back to `WORKER` or deletes the exec
  profile — keep the User record, just demote the role)

**Invite Executive modal:**
- Full Name
- Email address
- Role (dropdown: CO_CEO_CFO, HOG, COO — cannot invite another SUPER_ADMIN
  from this UI; that requires direct DB access)
- On submit: create the `User` record with a temporary password, create the
  `ExecProfile` record, send a welcome email with login credentials

**Do not build the email sending in Phase 1.** Show the temporary password
on screen after creation so Prince can manually send it. Add a "Copy
credentials" button.

**API routes needed:**

```
GET    /api/admin/team          — list all executive users
POST   /api/admin/team          — invite new executive (create user + exec profile)
PATCH  /api/admin/team/[id]     — update role, email, or exec profile
DELETE /api/admin/team/[id]     — remove from executive team (demote role)
POST   /api/admin/team/[id]/reset-password — generate temp password
```

All these routes must be gated: only `SUPER_ADMIN` can call them. Return 403
for any other role.

### 3.7 Topbar Updates

The topbar currently shows a generic greeting. Update it:

**Greeting logic:**
```typescript
// Show the executive's full name and role title
// e.g., "Welcome back, Jubilee" (using first name from ExecProfile)
// Role badge beside the name:
// SUPER_ADMIN  → "CEO"       (teal badge)
// CO_CEO_CFO   → "CFO"       (gold badge)
// HOG          → "HOG"       (green badge)
// COO          → "COO"       (purple badge)
```

**Add a role indicator chip** in the topbar next to the user's name. Small,
coloured, shows the abbreviated role name. This makes it immediately clear
who is logged in and as what role.

**The lightning bolt balance indicator** (already built in AI Usage) should
remain visible for `SUPER_ADMIN` and `CO_CEO_CFO`. Hide it for `HOG` and
`COO`.

### 3.8 Stub Pages for Routes That Don't Exist Yet

Several routes in the sidebar matrix don't have pages yet. Create stubs for
all of them. Each stub must:

1. Be accessible only to the correct roles (middleware handles this)
2. Show the page title and a brief "Coming soon" message with the expected
   functionality described
3. Be visually consistent with the rest of the admin UI (use the existing
   card/layout components)
4. NOT be a generic 404 — it should look like a real page that's in progress

Stubs needed:
- `/admin/ambassadors` — if not built yet
- `/admin/growth` — new page
- `/admin/reports/finance` — new page
- `/admin/reports/growth` — new page
- `/admin/reports/operations` — new page
- `/admin/settings/bank` — new page

The following should already have real pages (from previous build phases).
If they are stubs, note it but don't rebuild them in Phase 1:
- `/admin` (Command Center)
- `/admin/projects`
- `/admin/clients`
- `/admin/workers`
- `/admin/finance`
- `/admin/finance/ai-usage`
- `/admin/finance/payouts`
- `/admin/qa`
- `/admin/research-requests`
- `/admin/settings/team` (build this in Phase 1 — it is the role manager)
- `/admin/settings/services`

---

## PART 4 — WHAT NOT TO BUILD IN PHASE 1

Phase 1 is infrastructure only. Do not build:

- The full Finance Platform (Revenue Tracker, Payout Engine, Bucket Manager,
  Founder Draws) — that is Phase 2
- The full Ambassador Platform — that is Phase 3
- The full Operations Platform — that is Phase 4
- Email sending / notification system
- Any chart or dashboard that requires real financial data
- Commission calculation logic

Build only the RBAC layer. The tabs are real. The stubs are placeholders.
The role assignment works. The middleware protects routes. The sidebar
filters correctly. That is Phase 1 done.

---

## PART 5 — COMMISSION & PAYMENT STRUCTURE (FOR CLAUDE.md UPDATE)

Update `CLAUDE.md` after building Phase 1 with these constants. The
commission structure will be used in Phase 2 (Finance Platform) to calculate
automatic payouts. Record them now so Phase 2 can reference them.

```markdown
## EduCraft Commission Structure (v2.0 — September 2026)

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
```

---

## PART 6 — BUILD SEQUENCE

Follow this exact order. Do not skip steps. Each step must be working before
moving to the next.

```
STEP 1: Schema update
  — Add CO_CEO_CFO, HOG, COO to UserRole enum
  — Add ExecProfile model
  — Run: npm run db:migrate
  — Verify migration succeeded in Supabase schema visualizer

STEP 2: Seed executive users
  — Update prisma/seed.ts with the three executives
  — Run: npm run db:seed
  — Verify all three user records exist with correct roles in Supabase

STEP 3: Auth session update
  — Update lib/auth.ts to include role in session token
  — Update NextAuth type declarations
  — Update signIn callback to populate name from ExecProfile
  — Test: log in as SUPER_ADMIN, confirm role is in session
  — Test: log in as CO_CEO_CFO (jubilee@educraft.com), confirm role is
    CO_CEO_CFO and redirect goes to /admin/finance

STEP 4: Middleware
  — Create/update middleware.ts with routePermissions map
  — Test: as COO, try navigating to /admin/finance — should redirect to
    /admin/projects
  — Test: as HOG, try navigating to /admin/workers — should redirect to
    /admin/ambassadors
  — Test: as SUPER_ADMIN, navigate everywhere — no redirects

STEP 5: Sidebar config and filtering
  — Create lib/sidebar-config.ts
  — Update sidebar component to filter by role
  — Test: log in as each role, confirm only correct tabs appear
  — Confirm empty sections are hidden (not just items)

STEP 6: Topbar updates
  — Add full name display (from ExecProfile)
  — Add role badge with correct colour per role
  — Hide lightning bolt for HOG and COO

STEP 7: Login routing
  — Confirm each role redirects to correct home on login
  — CO_CEO_CFO → /admin/finance
  — HOG → /admin/ambassadors
  — COO → /admin/projects
  — SUPER_ADMIN → /admin

STEP 8: Settings > Team & Roles page
  — Build /admin/settings/team
  — List all executive users
  — Edit modal (change role, email)
  — Invite Executive modal (create user + exec profile)
  — "Copy credentials" button
  — API routes (GET, POST, PATCH, DELETE, reset-password)
  — Gate all API routes to SUPER_ADMIN only

STEP 9: Stub pages
  — Create stubs for all routes that don't have real pages yet
  — Each stub: correct page title, role-gated, "coming soon" with feature
    description

STEP 10: CLAUDE.md update
  — Add commission structure constants (from Part 5)
  — Add role descriptions and sidebar matrix
  — Add Phase 1 completion note and what Phase 2 will build

STEP 11: Final verification pass
  — Log in as each of the four roles
  — Confirm correct tabs in sidebar
  — Confirm correct home page on login
  — Confirm blocked routes redirect silently
  — Confirm Settings > Team & Roles shows correct users
  — Confirm topbar shows correct name and role badge
  — Confirm Clients tab is read-only for CO_CEO_CFO and COO
  — Run: npm run build — zero TypeScript errors, zero build failures
  — Deploy to Vercel
```

---

## PART 7 — TESTING CHECKLIST

Before declaring Phase 1 done, every item on this checklist must pass.

### Schema & Database
- [ ] `UserRole` enum has all six values: SUPER_ADMIN, CO_CEO_CFO, HOG, COO, WORKER, AMBASSADOR
- [ ] `ExecProfile` table exists in Supabase
- [ ] Three executive user records exist with correct roles and hashed passwords
- [ ] Three ExecProfile records exist linked to the user records
- [ ] Migration history is clean (no failed migrations)

### Authentication
- [ ] Session token contains `role` field
- [ ] Session token contains `name` field (from ExecProfile, not email)
- [ ] Each role redirects to the correct home page on login
- [ ] Logging out works for all roles and redirects to `/login`

### Route Protection (Middleware)
- [ ] COO cannot access `/admin/finance` — redirected to `/admin/projects`
- [ ] HOG cannot access `/admin/workers` — redirected to `/admin/ambassadors`
- [ ] CO_CEO_CFO cannot access `/admin/projects` — redirected to `/admin/finance`
- [ ] COO can access `/admin/finance/payouts` — not blocked
- [ ] HOG cannot access `/admin/finance/payouts` — redirected
- [ ] SUPER_ADMIN can access all routes without any redirects
- [ ] Direct URL navigation is blocked, not just sidebar hiding

### Sidebar
- [ ] SUPER_ADMIN sees all 14+ tabs across all sections
- [ ] CO_CEO_CFO sees: Clients (read-only), Finance, Payout Queue, AI Usage,
      Finance Reports, Bank Details — and NOTHING else
- [ ] HOG sees: Ambassadors, Growth, Growth Reports, Bank Details — and NOTHING else
- [ ] COO sees: Projects, QA Review, Research Approvals, Clients (read-only),
      Workers, Payout Queue, Operations Reports, Bank Details — and NOTHING else
- [ ] Empty sections are completely absent from DOM
- [ ] Active tab is highlighted correctly for current route

### Topbar
- [ ] Each role shows the correct full name (not email prefix)
- [ ] Each role shows the correct role badge with correct colour:
      CEO (teal), CFO (gold), HOG (green), COO (purple)
- [ ] Lightning bolt balance indicator hidden for HOG and COO
- [ ] Lightning bolt visible for SUPER_ADMIN and CO_CEO_CFO

### Clients Tab Read-Only
- [ ] CO_CEO_CFO can view the Clients list
- [ ] CO_CEO_CFO cannot see "New Client", "Edit", or "Delete" buttons
- [ ] CO_CEO_CFO cannot call client mutation API routes (returns 403)
- [ ] COO can view the Clients list
- [ ] COO cannot see or call client mutation API routes

### Settings > Team & Roles
- [ ] Page is visible only in SUPER_ADMIN sidebar
- [ ] Page shows all four executive users in a table
- [ ] Edit modal opens and allows role and email change
- [ ] Invite Executive modal creates a new user + ExecProfile
- [ ] Temporary credentials are shown on screen after creation
- [ ] "Copy credentials" button works
- [ ] Role cannot be changed to SUPER_ADMIN from this UI
- [ ] Demoting a user changes their role to WORKER and removes exec profile

### Build Quality
- [ ] `npm run build` passes with zero TypeScript errors
- [ ] No `any` types introduced
- [ ] No `console.log` statements left in production code
- [ ] All API routes return proper HTTP status codes
- [ ] Deployed to Vercel successfully
- [ ] Live URL confirmed working for all four roles

---

## PART 8 — IMPORTANT CONSTRAINTS

**Do not break what already works.** The existing SUPER_ADMIN login, the
Command Center, the Projects page, the Workers page, the Finance > AI Usage
page — all of these must continue to work exactly as they do now. Phase 1
adds capabilities; it does not rebuild existing ones.

**Use the existing component library.** All new UI uses the existing shadcn/ui
components, Tailwind classes, and the established colour palette
(teal `#0D9488`, dark `#0F172A`, etc.). Do not introduce new UI libraries.

**TypeScript is strict.** No `any`. No `// @ts-ignore`. If you are unsure
of a type, ask. A TypeScript error is a bug.

**Use server-side session checks in API routes.** Never trust role information
from the request body or query params. Always read the role from the
server-side session:

```typescript
// In every protected API route
const session = await getServerSession(authOptions)
if (!session || session.user.role !== 'SUPER_ADMIN') {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

**The middleware is the first line of defence.** The sidebar filtering is
a UX improvement. The middleware and server-side checks are the security
layer. Both are required. Do not rely on the sidebar alone.

---

## SUMMARY

Phase 1 delivers:

1. Four executive roles in the database
2. Three executive users seeded with real names and correct roles
3. Authentication that includes role in session token
4. Post-login routing to the correct domain per role
5. Middleware that blocks unauthorized route access (silent redirect, not 403)
6. Sidebar that renders only the tabs each role is authorized to see
7. Topbar with correct name and role badge per executive
8. Settings > Team & Roles page for Prince to manage executive access
9. Stub pages for all routes that will be built in later phases
10. CLAUDE.md updated with commission structure for Phase 2 reference

When Phase 1 is done, every executive can log in, see their domain, and
cannot access anything outside it. Prince can log in, see everything, and
manage who has what role. The commission structure is documented in CLAUDE.md
and ready for Phase 2 (Finance Platform) to consume.

**Phase 2 begins with the Finance Platform — the full CFO system including
Revenue Tracker, Payout Engine, Bucket Manager, Founder Draws, and Financial
Reports. Phase 2 will reference the commission constants from CLAUDE.md.**
