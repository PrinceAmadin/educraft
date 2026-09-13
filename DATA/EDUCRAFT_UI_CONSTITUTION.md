# EDUCRAFT UI CONSTITUTION — Complete Visual Overhaul

## Feed this entire document to Claude Code as a single prompt.
## Model: Opus · Effort: High (this defines the visual system everything else inherits)

---

## CONTEXT

The EduCraft HQ website and dashboard are functionally complete (Days 1–20 built). The UI needs a complete visual overhaul. Every page currently suffers from the same problem: **everything is a bordered card inside another bordered card.** This creates a generic, AI-generated appearance that does not match EduCraft's professional brand.

This document defines the new EduCraft visual system. Apply it to EVERY page — public and dashboard. Do not redesign one page at a time. Establish the system first, then apply it everywhere in one pass.

---

## THE CORE DESIGN PRINCIPLE

**Use spacing, typography, alignment and surface contrast to create hierarchy BEFORE reaching for borders.**

A border should be the LAST resort, not the first. Ask for every element: "Can this be separated from its neighbors using whitespace alone? If not, can a subtle background change do it? If not, can a very soft shadow do it? Only if none of those work, use a border — and make it nearly invisible."

---

## THEME

**Light mode is the DEFAULT.** Dark mode is secondary and optional.

EduCraft is an academic documentation service. The default experience should communicate: clarity, paper, research, professionalism, trust. Light mode does this naturally.

Keep the theme toggle. Dark mode remains available but is redesigned AFTER light mode is complete — do not simply invert colors.

### Light Mode Palette

| Token | Value | Usage |
|---|---|---|
| `--bg-page` | `#FAFAFA` or `#F8F9FA` | Main page background — warm off-white |
| `--bg-surface` | `#FFFFFF` | Cards/surfaces that need slight elevation |
| `--bg-subtle` | `#F1F3F5` | Subtle background zones (stats area, pipeline area) |
| `--bg-input` | `#F5F6F4` | Input field fill — light neutral, not white |
| `--text-primary` | `#0F172A` | Primary text — very dark navy |
| `--text-secondary` | `#475569` | Secondary text — medium gray |
| `--text-tertiary` | `#94A3B8` | Placeholder, disabled, metadata |
| `--accent` | `#0D9488` | EduCraft teal — links, active states, CTAs |
| `--accent-hover` | `#0F766E` | Teal hover |
| `--accent-gold` | `#F59E0B` | Secondary accent — warnings, highlights |
| `--border` | `#E8EAED` | ONLY when a border is genuinely needed — very faint |
| `--shadow` | `0 12px 40px rgba(15, 23, 42, 0.06)` | Soft, barely visible elevation |
| `--success` | `#10B981` | |
| `--warning` | `#F59E0B` | |
| `--danger` | `#EF4444` | |

### Dark Mode Palette (secondary — redesign AFTER light is complete)

Use multiple subtle surface depths, NOT navy + gray border on everything:

| Token | Value |
|---|---|
| `--bg-page` | `#0B1120` |
| `--bg-surface` | `#131B2E` — slightly lighter than page |
| `--bg-elevated` | `#1A2540` — another subtle level up |
| `--text-primary` | `#F1F5F9` |
| `--border` | `#1E3048` — barely visible, used sparingly |

---

## BORDER POLICY

**The #1 rule: eliminate the box-model-format appearance.**

Current state: every card, every form, every section has a visible rectangular border creating "boxes inside boxes inside boxes." This is what makes the UI look AI-generated.

New rules:

1. **Stats cards on the dashboard:** NO border. Use a very subtle background color difference (`--bg-surface` on `--bg-page`) and the soft shadow ONLY if needed. Most stats can sit directly on the page with just whitespace separating them.

2. **The pipeline bar:** NOT eleven bordered mini-cards. One horizontal process rail with counts beneath each stage. Active stage gets teal. Inactive stages are quiet text. No individual stage borders.

3. **Forms:** NO outer container border. The form content sits directly on the page. Section headings create organization. Individual input fields CAN have a subtle border or fill (`--bg-input`) for affordance — that's appropriate. But the form as a whole does not live inside a bordered rectangle.

4. **Tables:** Faint row dividers (1px `--border`), NOT a bordered container around the entire table. No outer card wrapping the table.

5. **Dashboard sections:** Use zones (subtle background bands) instead of cards. The stats zone, the pipeline zone, the activity zone — each gets a slight background variation, not a border.

6. **Sign-in page:** NO bordered card containing the login form. Use a split layout (brand left, form right on desktop) or just the form on the page (mobile). The form fields have subtle borders. The container does not.

**When a shadow IS used:** `0 12px 40px rgba(15, 23, 42, 0.06)` — so soft the user perceives depth without consciously seeing the shadow. NOT a visible black box-shadow under every element.

---

## TYPOGRAPHY

| Element | Font | Weight | Size (Desktop) | Size (Mobile) |
|---|---|---|---|---|
| Hero title | Inter or system sans | 800 | 64–80px | 48–56px |
| Page headings (H1) | Inter | 700 | 28–32px | 24–28px |
| Section headings (H2) | Inter | 600 | 20–24px | 18–20px |
| Body | Inter | 400 | 15–16px | 15–16px |
| Body line-height | | | 1.6–1.7 | 1.55–1.7 |
| Small/meta | Inter | 400 | 13px | 13px |
| Data/numbers | JetBrains Mono | 500 | 14–16px | 14–16px |
| UI labels | Inter | 500 | 13–14px | 13–14px |

**Monospace is an accent, not the primary typeface.** Use JetBrains Mono for: project IDs, financial figures, metadata, version numbers, code snippets. NOT for headings, labels, navigation, or body text.

**Reduce uppercase.** "ACTIVE PROJECTS" → "Active projects". The dashboard should feel calm, not like it's shouting. Reserve uppercase for very small metadata labels only.

---

## HERO SECTION

### Desktop

```
● TRUSTED BY STUDENTS ACROSS 10+ NIGERIAN UNIVERSITIES

EduCraft
Academic & Technical Documentation Experts

Final year projects, seminar reports, presentations, CVs 
and more — researched, written and quality-reviewed by 
field specialists.

[Start your project ↗]   Browse services & pricing ↗
```

**"EduCraft" is ONE WORD on ONE LINE.** No break between "Edu" and "Craft."

Styling: "Edu" in white/dark, "Craft" in teal. Both on the same line. The script/italic treatment on "Craft" can remain but MUST NOT cause a line break.

The document mockups on the right: KEEP them (they're one of the better design decisions). But refine: fewer documents, more intentional overlap, realistic paper shadows, actual EduCraft content visible on them.

### Mobile

**Do NOT squeeze the desktop layout.** Compose a separate mobile version:

```
● TRUSTED BY STUDENTS ACROSS 10+ NIGERIAN UNIVERSITIES

EduCraft
Academic & Technical Documentation Experts

Academic and technical work, researched, written 
and quality-reviewed by specialists.

[Start your project ↗]
Browse services & pricing ↗
```

- Shorter body text on mobile (the full desktop paragraph is too long for a phone screen)
- Document mockups move BELOW the text content on mobile, or are hidden entirely
- Typography is tighter: hero title ~48–56px, subheading ~20px, body ~15px
- Control max-width and line lengths — no arbitrary wrapping

---

## SCROLL NAVIGATION

**Remove the current bordered button format entirely.**

Replace with Traqly-style floating controls:

- **Position:** fixed, right edge, vertically centered or lower-right
- **Icons:** double chevron up (⇈) and double chevron down (⇊) — use Lucide `ChevronsUp` and `ChevronsDown`
- **NO background, NO border, NO rectangular container, NO page counter**
- **Glow effect:** subtle teal outer glow (`box-shadow: 0 0 20px rgba(13, 148, 136, 0.3)`)
- **Hover:** glow brightens slightly, icon shifts slightly in scroll direction
- **Behavior:** UP scrolls to page top. DOWN scrolls to page bottom. NOT section-by-section navigation.
- **Mobile:** hitbox 44×44px for touch, but visible icon stays small
- **Color:** EduCraft teal glow, NOT blue/purple like Traqly

```css
.scroll-control {
  position: fixed;
  right: 24px;
  bottom: 50%;
  transform: translateY(50%);
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 50;
}

.scroll-btn {
  background: none;
  border: none;
  color: var(--accent);
  filter: drop-shadow(0 0 12px rgba(13, 148, 136, 0.35));
  cursor: pointer;
  padding: 8px;
  transition: all 0.2s ease;
}

.scroll-btn:hover {
  filter: drop-shadow(0 0 20px rgba(13, 148, 136, 0.5));
  transform: translateY(-2px); /* for up button */
}
```

---

## SERVICES PAGE

**Current problem:** an endless vertical list of individual services. Unusable on mobile.

**New architecture:**

### Top Section
```
Services
Everything you need for academic, technical and 
professional documentation.

[🔍 Search services...]

[All] [Academic] [Research] [Career] [Presentations] [Editing] [Combos]
```

Category filters are horizontal pills. Clicking one filters the list. Search filters by name.

### Service Display

Group services by category. Within each category, use compact rows — NOT individual bordered cards:

```
Academic Writing
─────────────────────────────────────────────────────
Final Year Project          ~30 days    from ₦70,000    Details →
  Without Data Analysis — ₦70,000
  With Data Analysis — ₦90,000

Seminar Report              ~10 days    ₦25,000         Details →
IT Report (1-3 Months)      ~7 days     ₦15,000         Details →
IT Report (4-6 Months)      ~10 days    ₦20,000         Details →
Term Paper                  ~5 days     ₦15,000         Details →
```

Services with variants (like FYP with/without DA) expand on click to show options.

**"Details →" not "Order now →"** — reduce the aggressive selling appearance. The detail view contains the primary CTA.

**Pricing must match the actual EduCraft price list** (from the uploaded flyers). Cross-reference every service and price against the flyer images. Remove any services not on the flyers. Add any missing services from the flyers.

### Mobile
Same architecture but: full-width rows, category filters scroll horizontally, search is prominent at top.

---

## FORMS — ALL FORMS ACROSS THE SITE

**Remove the outer container border on every form.**

Forms sit directly on the page. Organization comes from section headings, not from boxing the entire form.

```
Personal Information

Full name                    WhatsApp
[____________________]       [____________________]

Email                        University
[____________________]       [____________________▼]
```

- Section headings separate groups of fields
- Input fields: light fill (`--bg-input`), subtle 1px border, teal focus ring
- NO outer rectangle around the entire form
- NO card component wrapping the form

**University dropdown:** must support both dropdown selection AND typing. Use a combobox/autocomplete component — user can type to filter, or scroll the dropdown. Include all universities in the database PLUS an "Other" option that reveals a text input.

---

## SIGN-IN PAGE

**Desktop:** Split layout — brand/visual on the left, form on the right. No bordered card.

```
┌────────────────────────┬──────────────────────┐
│                        │                      │
│  EduCraft              │  Welcome back        │
│                        │                      │
│  Academic work,        │  Email               │
│  professionally        │  [________________]  │
│  delivered.            │                      │
│                        │  Password            │
│  [Document visual      │  [________________]  │
│   or testimonial]      │                      │
│                        │  [Sign in]           │
│                        │                      │
└────────────────────────┴──────────────────────┘
```

No visible divider needed — the layout creates the separation.

**Mobile:** Just the form. Small EduCraft logo above. No split layout.

---

## DASHBOARD — ALL ADMIN/WORKER/AMBASSADOR PAGES

### Stats Cards
Remove borders. Use subtle background zones or NO background at all — just the number, label, and icon sitting on the page with whitespace.

```
Active projects          Revenue (month)        Pending payouts
34                       ₦248,500               ₦72,000
+3 today                 ↑ 18.4%                4 workers, 2 ambassadors
```

NOT four bordered rectangles. Just data with breathing room.

### Pipeline Bar
One continuous horizontal rail, NOT eleven mini-cards:

```
New  Downpay  Confirmed  Assigned  Progress  Waiting  Submitted  QA  Approved  Balance  Delivered
 1     0        0          0         0         0         0        0     0         0        0
━━━
```

Active stages get teal text/indicator. Inactive stages are gray. Counts sit beneath. The whole thing is one visual unit, not eleven boxes.

### Tables
No outer card wrapping. Faint row dividers. Clean header row. The table IS the content — it doesn't need a container around it.

### Sidebar
Keep the current structure. Remove any border between sidebar and content area — use a subtle background difference instead. Reduce uppercase labels.

---

## AMBASSADOR SYSTEM — USE EXISTING CODEBASE

**DO NOT create a new ambassador pipeline.** The existing Ambassador Panel codebase is functional and has real data. The task is:

1. Copy the existing ambassador codebase into the EduCraft HQ project
2. Change ONLY the UI to match the new EduCraft design system defined in this document
3. Keep all existing routes, data models, and logic intact
4. The ambassador dashboard, schools view, tracking, and management all stay functionally identical
5. Only the visual presentation changes

If the existing ambassador code is at a separate repo/URL, integrate it as pages under `/ambassador` in the EduCraft HQ project.

---

## CV/CAREER BENTO GRID — IMAGE FIX

The CV & Career section in the bento grid currently shows black backgrounds where images should be.

Fix: load CV images from `public/images/cv_img/`. If the folder is empty, use a paper-colored placeholder (`#F5F5F0`) with a subtle CV icon centered, NOT black. The background color for any image-loading state should be warm paper-white, never black.

For the image carousel: one main CV mockup centered, partially visible prev/next on sides, slow auto-transition (4 seconds), smooth crossfade. Not a grid of rectangles.

---

## IMPLEMENTATION ORDER

1. **First:** Update the global CSS/Tailwind config with the new color tokens and shadow values
2. **Second:** Remove the default border from the Card component globally (or create a new `Surface` component that uses background+shadow instead of border)
3. **Third:** Fix the hero (one-word EduCraft, mobile composition, document mockups)
4. **Fourth:** Fix the scroll navigation (Traqly-style, no buttons)
5. **Fifth:** Redesign the sign-in page (split layout, no bordered card)
6. **Sixth:** Redesign the dashboard Command Center (zones not cards)
7. **Seventh:** Redesign the services page (search + categories + compact rows)
8. **Eighth:** Fix all forms (remove outer borders, section headings for organization)
9. **Ninth:** Fix all tables (remove outer card wrapper, faint row dividers)
10. **Tenth:** Complete mobile pass at 375px, 414px, 768px, 1024px
11. **Eleventh:** Complete light theme verification on every page
12. **Twelfth:** Redesign dark theme using the multi-surface-depth approach (NOT navy + borders)

---

## QUALITY CHECK

- [ ] Light mode is default on first visit
- [ ] "EduCraft" appears as one word everywhere (hero, nav, footer)
- [ ] No page has "boxes inside boxes" appearance
- [ ] Stats cards have no borders
- [ ] Pipeline is one visual rail, not mini-cards
- [ ] All forms have no outer container border
- [ ] Sign-in page has no bordered card
- [ ] Services page has search + category filters + compact rows
- [ ] Scroll controls are borderless double chevrons with teal glow
- [ ] Scroll UP goes to top, scroll DOWN goes to bottom (not section navigation)
- [ ] Mobile hero is separately composed (not squeezed desktop)
- [ ] University field supports typing + dropdown (combobox)
- [ ] All uppercase labels reduced to sentence case
- [ ] Monospace used only for data/IDs, not UI labels
- [ ] CV section shows paper-colored placeholders, not black
- [ ] Every page tested at 375px mobile width
- [ ] Ambassador pages use existing codebase with new UI skin
