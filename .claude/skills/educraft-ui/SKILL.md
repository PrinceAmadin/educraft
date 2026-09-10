---
name: educraft-ui
description: EduCraft HQ design system and UI conventions. Use when building or editing any UI — components, pages, layouts, forms, dashboards, tables, navigation, charts, or visual elements — in this project.
---

# EduCraft UI

Mobile-first, dark-default, Lucide-only. **85% of users are on phones: design at 375px first, scale up second.**

## Colors

Dark (default):

| Token | Hex |
|---|---|
| bg primary | `#0B1120` |
| bg secondary (cards) | `#111827` |
| bg tertiary (elevated) | `#1A2332` |
| border | `#1E3A4F` |
| text primary | `#F1F5F9` |
| text secondary | `#94A3B8` |
| accent teal | `#0D9488` |
| accent gold | `#F59E0B` |
| success | `#10B981` |
| warning | `#F59E0B` |
| danger | `#EF4444` |

Light:

| Token | Hex |
|---|---|
| bg primary | `#FFFFFF` |
| bg secondary | `#F8FAFC` |
| text primary | `#0F172A` |
| text secondary | `#475569` |
| accent teal | `#0D9488` |

Use semantic Tailwind tokens (`bg-background`, `bg-card`, `text-muted-foreground`, `border-border`) so both themes come free. Only reach for a raw hex when defining the token itself.

## Typography

- Headings — Inter 700 (`font-sans font-bold`)
- Body — Inter 400
- **Data / numbers / currency / IDs — JetBrains Mono 500** (`font-mono font-medium tabular-nums`)
- Brand wordmark — Poppins 700

Every stat value, price, count, percentage, and `EC-XXXXX` ID renders in JetBrains Mono.

## Icons — hard rule

```tsx
import { LuFileText, LuUsers, LuTrendingUp } from "react-icons/lu";
```

Only `react-icons/lu` (Lucide). **Zero emojis anywhere** — not in JSX, not in labels, toasts, empty states, or seed data. No other icon pack.

## shadcn/ui imports

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
```

Missing component? Add it with the shadcn CLI — never hand-roll a parallel primitive.

## Mobile-first rules

- **Desktop (>=1024px):** collapsible sidebar, 240px expanded / 64px collapsed.
- **Mobile (<1024px):** bottom navigation bar, **max 5 icons**, no sidebar, no hamburger drawer as primary nav.
- **Tables become cards below `md`.** Never horizontally scroll a data table on a phone.
- **Touch targets minimum 48px** (`min-h-12`) — inputs, buttons, select rows, nav items, tappable cards.
- Prefer native `<select>` on mobile for long option lists.
- Test every screen at **375px, 414px, 768px, 1024px**. Nothing overflows horizontally at 375px.
- Bottom nav needs safe-area padding (`pb-[env(safe-area-inset-bottom)]`); page content needs bottom padding so it is not hidden behind the nav.

## Component patterns

### StatsCard

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { IconType } from "react-icons";

interface StatsCardProps {
  title: string;
  value: string; // pre-formatted: ₦1,240,000 / 128 / 94%
  delta?: { value: string; positive: boolean };
  icon: IconType;
}

export function StatsCard({ title, value, delta, icon: Icon }: StatsCardProps) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-1 font-mono text-2xl font-medium tabular-nums text-foreground">
            {value}
          </p>
          {delta && (
            <p className={cn("mt-1 font-mono text-xs", delta.positive ? "text-emerald-500" : "text-red-500")}>
              {delta.value}
            </p>
          )}
        </div>
        <span className="rounded-lg bg-teal-600/10 p-2 text-teal-600 dark:text-teal-400">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </CardContent>
    </Card>
  );
}
```

Grid: `grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4` — two-up on phones, never one-up.

### StatusBadge — pipeline color map

```tsx
const STATUS_STYLES: Record<ProjectStatus, string> = {
  NEW:                    "bg-slate-500/15 text-slate-400 border-slate-500/30",
  DOWNPAYMENT_VERIFIED:   "bg-blue-500/15 text-blue-400 border-blue-500/30",
  REQUIREMENTS_CONFIRMED: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  ASSIGNED:               "bg-purple-500/15 text-purple-400 border-purple-500/30",
  IN_PROGRESS:            "bg-teal-500/15 text-teal-400 border-teal-500/30",
  AWAITING_CLIENT_INPUT:  "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
  SUBMITTED:              "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  IN_QA_REVIEW:           "bg-orange-500/15 text-orange-400 border-orange-500/30",
  REVISION_NEEDED:        "bg-orange-500/15 text-orange-400 border-orange-500/30",
  APPROVED:               "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  BALANCE_VERIFIED:       "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  DELIVERED:              "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  COMPLETED:              "bg-emerald-600/20 text-emerald-300 border-emerald-600/40",
  OVERDUE:                "bg-red-500/15 text-red-400 border-red-500/40 animate-pulse",
  ON_HOLD:                "bg-slate-500/15 text-slate-400 border-slate-500/30",
  CANCELLED:              "bg-slate-500/10 text-slate-500 border-slate-500/20 line-through",
  REFUNDED:               "bg-slate-500/10 text-slate-500 border-slate-500/20 line-through",
  DISPUTED:               "bg-red-500/15 text-red-400 border-red-500/30",
};
```

Render labels as Title Case with spaces (`IN_QA_REVIEW` → "In QA Review"), never the raw enum. OVERDUE pulses; CANCELLED/REFUNDED strike through.

Deadline urgency colours: 5 days = muted, 3 days = gold, 1 day = red, passed = OVERDUE (pulsing).

### DataTable → mobile cards

One component, two renderings — never ship a table that only works on desktop:

```tsx
<>
  {/* Mobile */}
  <div className="space-y-3 md:hidden">
    {rows.map((row) => (
      <Card key={row.id} className="border-border bg-card">
        <CardContent className="min-h-12 space-y-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-sm">{row.code}</span>
            <StatusBadge status={row.status} />
          </div>
          <p className="truncate text-sm text-muted-foreground">{row.title}</p>
        </CardContent>
      </Card>
    ))}
  </div>

  {/* Desktop */}
  <Table className="hidden md:table">{/* ... */}</Table>
</>
```

Every list needs three states: `Skeleton` rows while loading, an error state with a retry action, and an `EmptyState` (icon + copy + primary action, e.g. "No projects yet"). Never a blank region.

### Forms

React Hook Form + Zod, one step per screen on mobile:

```tsx
const schema = z.object({ fullName: z.string().min(2, "Enter your full name") });
type Values = z.infer<typeof schema>;
const form = useForm<Values>({ resolver: zodResolver(schema), mode: "onBlur" });
```

- Inputs `min-h-12` and `text-base` (prevents iOS zoom); every input has a bound `FormLabel`.
- Each step validates independently; back-navigation preserves entered data.
- Nav buttons sticky at the bottom on mobile: `sticky bottom-0 border-t border-border bg-background/95 p-4 backdrop-blur`.
- Progress indicator on multi-step forms; disable Next while submitting and show a spinner in the button.
- Errors show inline via `FormMessage` — never an alert dialog for validation.

## Theming

- Class-based dark mode (`dark` on `<html>`), dark is the default.
- Both themes must be equally polished — check contrast, borders, and chart colours in both before calling a screen done.
- Logo swaps with theme: dark bg → `public/images/logo/transparent_light_logo.png`; light bg → `transparent_dark_logo.png`.
- Never hardcode `text-white` / `bg-black`; use tokens.

## Animation

Framer Motion only. Purposeful and fast: 150–500ms, spring physics.

```tsx
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ type: "spring", stiffness: 300, damping: 30 }}
/>
```

Stagger lists ~40ms. Respect `prefers-reduced-motion`. No CSS keyframe animations except the OVERDUE pulse.

## Checklist before finishing any UI work

1. Works at 375px with no horizontal overflow.
2. Lucide icons only, zero emojis.
3. Numbers in JetBrains Mono.
4. Loading, error, and empty states exist.
5. Looks right in dark **and** light.
6. Touch targets >=48px.
7. Any table has a mobile card rendering.
