# EduCraft WorkBase

Operations platform for EduCraft — academic services for university students across Nigeria.

Four roles share one system: **Super Admin** (founders), **Workers** (freelancers who
produce the work), **Ambassadors** (students who refer clients), and **Clients**.

---

## Status — Phase 1 (Foundation) complete

| Area | State |
|---|---|
| Project setup (Next.js 14, TypeScript, Tailwind, shadcn/ui) | ✅ |
| Theme system (dark default, light toggle, brand tokens) | ✅ |
| Brand assets + theme-aware `Logo` | ✅ |
| Prisma schema (full data model) | ✅ |
| Seed data (36 services, 20 universities, settings) | ✅ |
| Auth (credentials, role-based routing, middleware) | ✅ |
| Dashboard shell (sidebar, topbar, mobile bottom nav) | ✅ |
| Public landing page | ✅ |
| Command Center, projects, intake forms, finance | Phases 2–8 |

---

## Getting started

```bash
npm install
npx prisma generate          # npm blocks install scripts, so run this explicitly
```

Create `.env.local` from the template and fill it in:

```bash
cp .env.example .env.local
```

| Variable | Notes |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Railway, Supabase, or local) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | `http://localhost:3000` in development |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Creates the first Super Admin when seeding |

Then push the schema and seed:

```bash
npm run db:push
npm run db:seed
npm run dev
```

Sign in at `/login` with the seeded admin credentials.

> The seed skips admin creation if `SEED_ADMIN_PASSWORD` is empty — services,
> universities and settings still load. It is idempotent, so re-running is safe.

### Scripts

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Push schema without a migration (early development) |
| `npm run db:migrate` | Create and apply a named migration |
| `npm run db:seed` | Seed services, universities, settings, admin |
| `npm run db:studio` | Prisma Studio |

---

## Brand assets

Both logo variants live in `public/images/logo/`:

| File | Colour | Shown on |
|---|---|---|
| `transparent_light_logo.png` | Light / white banner | **Dark** theme |
| `transparent_dark_logo.png` | Dark / teal banner | **Light** theme |

Use the `Logo` and `LogoLockup` components from `src/components/shared/Logo.tsx` —
never reference the image paths directly:

```tsx
import { Logo, LogoLockup } from "@/components/shared/Logo";

<Logo size="xl" priority />                      // mark only
<LogoLockup href="/admin" tagline="WorkBase" />  // mark + wordmark
<LogoLockup markOnly />                          // collapsed sidebar rail
```

Sizes: `xs` (24px) · `sm` (32) · `md` (40) · `lg` (64) · `xl` (96) · `2xl` (128).

**Why both images render at once.** The component outputs both variants and swaps
them with Tailwind `dark:` classes rather than reading the theme in JavaScript.
`next-themes` only knows the resolved theme after mount, so a JS swap would either
flash the wrong logo or force the whole component client-side. CSS swapping is
server-renderable and flash-free. The hidden variant is not downloaded by the
browser in practice, since `display: none` images are deprioritised.

Currently used in: sidebar (expanded and collapsed), topbar (mobile), mobile "More"
sheet, login page, public header, public footer, landing hero, landing CTA, and the
favicon.

---

## Theme

Dark is the default. The palette is defined as HSL CSS variables in
`src/app/globals.css` — `:root` for light, `.dark` for dark — and surfaced through
Tailwind tokens.

| Token | Dark | Light |
|---|---|---|
| `bg-background` | `#0B1120` | `#FFFFFF` |
| `bg-card` | `#111827` | `#F8FAFC` |
| `bg-elevated` | `#1A2332` | `#F1F5F9` |
| `text-foreground` | `#F1F5F9` | `#0F172A` |
| `text-muted-foreground` | `#94A3B8` | `#475569` |
| `border-border` | `#1E3A4F` | `#E2E8F0` |
| `bg-primary` (teal) | `#0D9488` | `#0D9488` |
| `text-gold` | `#F59E0B` | `#D97706` |

Status colours: `success` `warning` `danger` `info`.

Never hard-code a hex value in a component — always use the token so both themes
stay correct.

### Typography

`Inter` for UI, `Poppins` for the brand wordmark and headings (`font-display`),
`JetBrains Mono` for numbers (`font-mono`, or the `.tabular` utility). Use `.tabular`
for every ₦ figure, project ID, and metric so columns align.

---

## Layout & responsiveness

85% of users are on phones, so mobile is the primary target.

| Breakpoint | Navigation |
|---|---|
| `< 768px` | Fixed bottom nav (max 5 slots). Admin's 5th opens a "More" sheet. Sidebar hidden. |
| `768–1023px` | Sidebar, collapsible to a 64px icon rail with tooltips. |
| `≥ 1024px` | Sidebar expanded (240px), content capped at 1400px. |

The sidebar is an in-flow flex child, so collapsing it reflows the content area.
Its state persists in `localStorage` (wrapped in `try/catch` for private mode).

Touch targets are ≥ 44px; form inputs are 48px.

---

## Auth & routing

Credentials provider (email + bcrypt) on a JWT session, with the role carried in the
token.

`src/lib/auth.config.ts` holds the **edge-safe** half of the config — middleware runs
on the edge runtime where Prisma and bcrypt cannot load. The provider that touches
the database lives in `src/lib/auth.ts` (Node runtime). Keep that split intact.

`src/middleware.ts` enforces the portal boundary:

| Role | Portal |
|---|---|
| `SUPER_ADMIN`, `OPS_MANAGER` | `/admin` |
| `WORKER` | `/worker` |
| `AMBASSADOR` | `/ambassador` |

A signed-in user who requests another role's portal is redirected to their own.
After sign-in the form lands on `/dashboard`, a server component that reads the
session and forwards to the right portal.

---

## Project structure

```
prisma/
  schema.prisma        Full data model
  seed.ts              Services, universities, settings, first admin
public/images/logo/    Both theme variants of the brand mark
src/
  app/
    (public)/          Landing page, public header/footer
    (auth)/login/      Sign-in
    (dashboard)/       Shell + admin / worker / ambassador portals
    dashboard/         Post-login role redirect
    api/auth/          NextAuth handlers
  components/
    ui/                shadcn/ui primitives
    layout/            Sidebar, Topbar, MobileNav, ThemeToggle
    shared/            Logo
  lib/
    auth.ts            Full auth (Node runtime)
    auth.config.ts     Edge-safe auth config for middleware
    constants.ts       Nav config, business rules, tiers
    db.ts              Prisma client singleton
    utils.ts           cn(), formatNaira(), initials()
  types/               next-auth module augmentation
```

Navigation is data-driven from `src/lib/constants.ts` — add a route there and it
appears in the sidebar and mobile nav for that role.

---

## Business rules encoded so far

| Rule | Value | Where |
|---|---|---|
| Downpayment | 45% | `constants.ts`, `Service.downpaymentPercentage`, settings |
| Worker payout | 40% | `constants.ts`, `Project.workerPayoutRate` |
| Revision cap before escalation | 3 | `constants.ts`, settings |
| Ambassador tiers | Bronze 10% · Silver 12% · Gold 15% · Platinum 15% | `constants.ts` |
| Express surcharge | ₦2,000 general · ₦5,000 FYP | Seeded per service |
| Annual revenue target | ₦1,000,000,000 | `constants.ts`, settings |

---

## Notes

- `npm install` prints an `allow-scripts` warning and skips package install scripts.
  Prisma's client is therefore generated by the explicit `npx prisma generate` step
  above, and `npm run build` runs it too.
- The build logs a `DecompressionStream is not supported in the Edge Runtime` warning
  from `jose` via `next-auth`. It is a known upstream warning on the v5 beta, not an
  error — the middleware builds and runs.
