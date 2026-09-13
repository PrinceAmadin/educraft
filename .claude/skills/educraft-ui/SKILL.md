---
name: educraft-ui
description: EduCraft HQ design system and UI conventions. Use when building or editing any UI — components, pages, layouts, forms, dashboards, tables, navigation, charts, or visual elements — in this project.
---

# EduCraft UI

Mobile-first, **light-default**, Lucide-only. **85% of users are on phones: design at 375px first, scale up second.**

Source of truth: `DATA/EDUCRAFT_UI_CONSTITUTION.md`. The one principle: **use spacing, typography, alignment and surface contrast to create hierarchy before reaching for borders.** Whitespace first → a zone (background band) → a soft shadow → a border only as a last resort, and nearly invisible.

## Colors

Always use the semantic tokens — they carry both themes. Raw hex only inside `globals.css`.

| Token | Light (default) | Dark | Use |
|---|---|---|---|
| `bg-background` | `#F8F9FA` | `#0B1120` | page |
| `bg-card` | `#FFFFFF` | `#131B2E` | raised surface (with `shadow-soft`) |
| `bg-zone` | `#F1F3F5` | between page and surface | background bands, empty states, notices |
| `bg-elevated` | `#F1F3F5` | `#1A2540` | hover, nested fills |
| `bg-input` / `border-input-border` | `#F5F6F4` / faint | deeper surface | field fill + edge |
| `text-foreground` | `#0F172A` | `#F1F5F9` | primary text |
| `text-muted-foreground` | `#475569` | slate | secondary text |
| `text-subtle` | `#64748B` | slate | tertiary / metadata |
| `primary` | `#0D9488` | teal | links, active, CTAs |
| `gold` / `success` / `danger` | deepened for text | — | status |
| `border-border` | `#E8EAED` | `#1E3048` | last resort only |
| `shadow-soft` / `shadow-lift` | — | — | surfaces / floating layers |

## Surfaces, not boxes

```tsx
import { Surface, SurfaceHeader } from "@/components/ui/surface";

<Surface tone="zone">…</Surface>      // bg-zone band, no shadow — stats, pipeline, notices
<Surface>…</Surface>                  // white + soft shadow — panels that float
<div className="surface p-5">…</div>  // same raised surface as a class
<div className="rounded-2xl bg-zone p-5">…</div>
```

- `Card` has **no border** (fill + `shadow-soft`). Prefer no container at all.
- Never nest a bordered box inside another box. Never wrap a form, a table, or a row of stats in a card.
- Dialogs, dropdowns, sheets and tooltips use `shadow-lift`, no border.

## Typography

- Page title: `PageHeader` (24px phones, 28px from sm). Section heading: `text-[15px] font-semibold` (or `SurfaceHeader`).
- **Sentence case everywhere.** Uppercase only on tiny metadata (`.eyebrow`).
- Field/stat labels: `.meta-label` (13px, medium, muted) — never uppercase, never mono.
- **JetBrains Mono only for data**: money, counts, percentages, `EC-XXXXX` IDs (`font-mono tabular-nums`).
- Brand: "EduCraft" is always one word on one line — "Edu" in ink, "Craft" in teal (`accent-serif` in display contexts).

## Icons — hard rule

`react-icons/lu` only. **Zero emojis anywhere** — UI, toasts, emails, seed data.

## Component patterns

### Stats — data with breathing room

```tsx
import { StatsCard, STATS_GRID } from "@/components/dashboard/StatsCard";

<section className={STATS_GRID}>
  <StatsCard label="Active projects" value="34" detail="+3 today" detailTone="success" icon={LuFolderKanban} href="/admin/projects" />
</section>
```

No border, no card. Two-up on phones, four-up from lg.

### Pipeline — one rail

`PipelineBar`: stage names on top, counts beneath, one continuous track; stages holding work are teal, empty ones quiet grey. Never eleven mini-cards.

### Tables — the table is the content

`Table` has a clean header row and faint dividers. **No outer container.** Below `md`, render the rows as `surface` blocks or a divided list — never a horizontally scrolling table on a phone.

### Forms — no outer container

```tsx
<form className="max-w-3xl space-y-12">
  <FormSection title="Personal information" description="…">
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <Field label="Full name" required htmlFor="name"><Input id="name" {...register("fullName")} /></Field>
    </div>
  </FormSection>
  <FormActions><Button type="submit">Save</Button></FormActions>
</form>
```

- `Input`, `Select`, `Textarea` share `fieldClasses`: light fill, faint edge, teal focus ring, 48px tall, `text-base`.
- Universities: `UniversityCombobox` (type-to-filter + scroll; `allowOther` where the schema accepts free text).
- `FormActions` sticks above the mobile bottom nav on phones.
- React Hook Form + Zod; each step validates independently; errors inline.

### Status badges

`StatusBadge` reads `STATUS_META` in `src/lib/status.ts` — tint fills with transparent borders. Title Case labels, never raw enums.

### States

Every list needs loading (`Skeleton`), error (with retry) and empty (`EmptyState` — a zone band with an icon, never a dashed box).

## Mobile-first rules

- Desktop ≥1024px: collapsible sidebar (240/64px), no dividing line — the sidebar is one surface step off the page.
- Mobile <768px: bottom nav, max 5 items, lifted by a soft upward shadow.
- Touch targets ≥48px. Test at 375, 414, 768, 1024. Nothing overflows horizontally at 375px.

## Theming

Class-based; **light is the default**. Dark is multi-surface depth (page → surface → elevated), not an inversion. Logo swaps with theme. Never hardcode `text-white` / `bg-black` outside intentionally fixed surfaces (photo scrims).

## Animation

Framer Motion, 150–500ms, springs. Stagger ~40ms. Respect `prefers-reduced-motion`.

## Checklist before finishing any UI work

1. No bordered box around a form, table, stat row or section; no boxes inside boxes.
2. Works at 375px with no horizontal overflow; tables have a mobile rendering.
3. Sentence case; mono only on data.
4. Lucide icons only, zero emojis.
5. Loading, error and empty states exist.
6. Looks right in light **and** dark.
7. Touch targets ≥48px.
