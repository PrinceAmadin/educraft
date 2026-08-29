# EduCraft Landing Page — Detailed Revision Prompt

Feed this entire document to Claude Code as a single prompt.

---

## CONTEXT

The current EduCraft editorial landing page is at ~45% of where it needs to be. Every section below has specific feedback that must be addressed. Do NOT skip any section. Work through them in order, top to bottom. When finished, verify the complete page renders correctly on desktop, tablet, and mobile in both dark and light themes.

Reference the Traqly website (https://traq.click) for the level of polish, interactivity, and professional feel we're targeting. EduCraft should feel equally premium but with its own academic identity.

**GLOBAL RULES (apply everywhere):**

1. All icons must come from `react-icons` (Lucide, Phosphor, or Tabler family — pick ONE family and use it consistently). ZERO emojis anywhere in the UI.
2. All animations use Framer Motion. Keep them purposeful, fast (150ms–500ms), and physically coherent (spring physics, not linear).
3. Light theme must look as polished as dark theme — it is currently broken and needs a full pass. Ensure all text is readable, all backgrounds have proper contrast, and the visual hierarchy holds in both themes.
4. Add a scroll navigation component (up/down arrows, bottom-right corner) similar to Traqly's — subtle, always visible, smooth-scrolls between sections. Style it to match EduCraft's brand (teal accent, not blue/purple like Traqly).
5. No section should feel static or "just listed." Every major section needs at least one intentional interactive element or scroll-driven animation.
6. The page should use `react-icons` — install it if not already present: `npm install react-icons`

---

## SECTION 1 — HERO

### Problems:
- The document mockups on the right are blank white pages with no content — they look like placeholder wireframes, not real academic work
- The headline copy ("Academic delivery, Nigeria" / "Academic work, done properly") is generic and doesn't speak boldly about EduCraft specifically
- The "Pay 45% to begin..." trust line needs to be removed entirely — it makes EduCraft sound transactional rather than professional
- The hero needs to grab attention and make the visitor feel "this company is serious"

### Changes Required:

**Hero visual (right side):** The document mockups must have actual readable content on them in EduCraft teal/brand colors — not blank pages. As the user scrolls down, the text on these documents should animate (scroll/reveal effect) showing snippets like:
- "Chapter One: Introduction"
- "1.1 Background of the Study"  
- "Chapter Three: Research Methodology"
- "References"
- "EduCraft Quality Review — PASSED"
- Academic metadata (page numbers, headers, figure labels)

This makes the documents feel alive — like real academic work flowing through them. Use CSS animations or Framer Motion for the scroll-text effect inside the document mockups.

**Hero headline — replace with:**

```
Edu                    ← in white/off-white
Craft                  ← in EduCraft teal, italic
```

Large, dramatic, two-line lockup. The brand name IS the headline.

Then beneath it, a strong supporting statement:

```
Academic & Technical Documentation Experts
```

Then a one-line descriptor:

```
Final year projects, seminar reports, presentations, CVs and more —
researched, written and quality-reviewed by field specialists.
```

**Hero CTAs:** Keep "Start your project" (primary, teal) and "Browse services & pricing" (secondary, outline/ghost).

**Remove entirely:** "Pay 45% to begin. The balance is only due once your work has passed quality review." — delete this line completely.

**Eyebrow label:** Change "ACADEMIC DELIVERY, NIGERIA" to something bolder:

```
TRUSTED BY STUDENTS ACROSS 10+ NIGERIAN UNIVERSITIES
```

---

## SECTION 2 — STATISTICS / METRICS BAND

### Problems:
- Currently plain, static, and unimpressive
- Numbers are inaccurate — need to be corrected
- No interactivity or visual interest

### Changes Required:

**Correct the data:**

| Metric | WRONG Value | CORRECT Value |
|---|---|---|
| Projects delivered | 1,200+ | 90+ |
| Universities covered | 20+ | 10+ |
| On-time delivery | 96% | 95% |
| Average rating | 4.8/5 | 4.5/5 |

**Make it interactive:** Each number should animate (count up from 0) when the section enters the viewport using Framer Motion's `useInView` + animated number counter. The count-up should use easing (not linear) — fast at first, then slow to land on the final number. Each metric staggers slightly (100ms delay between each).

**Visual treatment:** The "Projects delivered" number (90+) should be noticeably larger than the other three — it's the primary metric. Use the editorial staggered-size layout that's already there but make the animation sell it.

Add a subtle horizontal line or tonal background shift to separate this section from the hero above and the services below.

---

## SECTION 3 — SERVICES ("What We Do")

### Problems:
- Services are listed in plain rows with no visual interest
- No images showing actual work
- Feels like a text directory, not a premium service showcase
- Not interactive enough

### Changes Required:

**Add real work images.** The project contains folders with screenshots of actual EduCraft deliverables. Each service row should reveal a preview image on hover (desktop) or show it inline (mobile):

| Service | Image Source Folder |
|---|---|
| Final Year Projects | `public/images/fyb_img/` |
| Reports & Papers | `public/images/report_img/` |
| Presentations | `public/images/ppt_img/` |
| CV & Career | Search for and download 2-3 professional CV template images, save to `public/images/cv_img/` |
| Editing & Formatting | Use images from `public/images/report_img/` or `public/images/fyb_img/` |
| Combined Packages | Use images from `public/images/fyb_img/` |

**First, check if these folders exist.** If they don't exist yet, create the folder structure and add a note that images need to be added manually. Design the component to gracefully handle missing images (show a styled placeholder with the service icon instead).

**Hover interaction (desktop):** When the user hovers over a service row:
1. A preview image (from the corresponding folder) slides in from the right or fades in with scale
2. The service title shifts slightly or changes color to teal
3. The row background subtly changes
4. The arrow icon animates (moves right)
5. The service number gets a teal highlight

**Mobile:** Show a small thumbnail image inline with each service row (no hover needed — always visible).

**The overall layout should feel like a premium portfolio/catalogue**, not a plain text list. Think editorial magazine layout where each service entry has visual weight.

---

## SECTION 4 — PROCESS ("How It Works")

### Status: Mostly good. Minor text updates only.

### Changes Required:

**Step 01 — Brief:** Change the description from:
"One guided form captures your topic, supervisor, department format and any files you already have. No long back-and-forth on WhatsApp."

To:
"EduCraft form captures your topic, supervisor, department format and any files you already have. No unnecessary back-and-forth on WhatsApp."

**All other steps (02–05):** Keep as-is. The timeline layout and scroll interaction are good.

**Enhancement:** If not already present, add a subtle animation where the active step's number pulses or glows in teal as the user scrolls through the timeline. The connecting line between steps should fill/animate as the user progresses.

---

## SECTION 5 — SPECIALISTS ("Who Does the Work")

### Problems:
- The discipline list is unnecessarily long and takes up too much vertical space
- Just listing 8 disciplines in full rows feels like a directory, not a premium showcase
- Needs more class and visual sophistication

### Changes Required:

**Condense the layout.** Instead of 8 full-width rows each taking significant vertical space, use one of these approaches:

**Option A — Animated discipline carousel/marquee:**
A horizontal scrolling marquee of discipline names that moves slowly and continuously. On hover, the marquee pauses and the hovered discipline expands to show its sub-fields. This is compact, modern, and interactive.

**Option B — Compact grid with hover expansion:**
Show all 8 disciplines in a 2×4 or 4×2 grid (compact). Each discipline shows just the name. On hover/tap, it expands to reveal the sub-fields with a smooth Framer Motion animation.

**Option C — Interactive discipline selector:**
Show the main statement ("Specialists, not generalists") with a single highlighted discipline that cycles automatically every 3 seconds (with crossfade animation). Below it, the sub-fields for the currently highlighted discipline are shown. User can also click/tap any discipline name to select it manually.

Pick whichever approach creates the most polished, compact result. The key requirement is: **do NOT list all 8 disciplines as 8 full-height rows.** Make it interactive and space-efficient.

Keep the header copy: "Specialists, not generalists." and the supporting text about assignment to field experts.

---

## SECTION 6 — QUALITY CONTROL

### Status: Good foundation. Needs the chapter slider enhancement.

### Changes Required:

**Add a chapter slider.** The current QA visual only shows "Chapter Three — Research Methodology." Convert this into an interactive slider/carousel that cycles through all 5 chapters:

| Chapter | Title | Visual Content |
|---|---|---|
| Chapter 1 | Introduction | Show: Background of Study, Problem Statement, Objectives, Scope |
| Chapter 2 | Literature Review | Show: Theoretical Framework, Empirical Review, Conceptual Framework |
| Chapter 3 | Research Methodology | Show: Research Design, Population, Sampling, Data Collection (current content) |
| Chapter 4 | Data Analysis | Show: Data Presentation, Analysis, Discussion of Findings |
| Chapter 5 | Summary & Conclusion | Show: Summary, Conclusion, Recommendations, References |

**Interaction:**
- Previous/Next buttons (styled arrows, not text) to navigate between chapters
- The document mockup in the center transitions between chapters with a smooth animation (slide or crossfade)
- Each chapter's document should have scroll-text animation (text scrolling upward inside the document frame, similar to the hero documents)
- The QA annotation labels (A — Research Verified, B — References Checked, etc.) should animate in when each chapter loads
- Auto-advance every 5 seconds if user isn't interacting, pause on hover/interaction
- Use Framer Motion for all transitions — `AnimatePresence` with `mode="wait"` for chapter swaps

**The "PASSED" badge** should appear with a satisfying animation (scale + fade) after the annotations have all appeared, creating a sense of completion.

---

## SECTION 7 — TESTIMONIALS

### Status: Good. Keep as-is for now.

Prince will provide real testimonials from actual clients later. For now, the placeholder testimonials and the editorial quote layout are fine.

---

## SECTION 8 — FINAL CTA

### Problems:
- Currently has text-heavy metadata section (45%, 3 rounds, Every file) that needs to be removed
- Needs the EduCraft banner image as background

### Changes Required:

**Background:** Use the `educraft_banner.png` image (already in the codebase at project root or `public/`) as the background of this section. Apply a dark gradient overlay (from left to right, or bottom to top) so the text remains readable against the image. The image should be `object-fit: cover` and fill the section.

**Content — keep only:**
```
06 —— START

Start the project.
Finish the degree.

One form to begin. A specialist in your field, a mandatory quality 
review, and your finished work — with the balance due only at the end.

[Start your project]  [Become an ambassador]
```

**Remove entirely:**
```
45% to begin — balance on delivery
3 rounds of in-scope supervisor corrections  
Every file quality reviewed before release
```

Delete this metadata block completely. The CTA should be clean: headline, one supporting line, two buttons, banner background. Nothing else.

---

## SECTION 9 — FOOTER

### Changes Required:

**Update contact information:**
- Phone: 07063421088
- Email: educraft611@gmail.com

**Update the tagline/slogan to:**
"EduCraft — Providing Affordable Academic Services"

This should appear below the EduCraft logo in the footer, replacing whatever is currently there.

**Keep:** The Services, Company, and Account navigation columns. The copyright line.

**Ensure:** Footer looks equally good in light and dark themes.

---

## GLOBAL FIX 1 — LIGHT THEME

The light theme is currently broken/ugly. Do a complete pass:

1. Switch to light theme and inspect every section
2. Ensure all text has sufficient contrast against light backgrounds
3. The hero document mockups need adjusted styling for light theme (they shouldn't look washed out)
4. The service rows need visible but subtle separators in light theme
5. The QA document mockup needs a subtle shadow/border in light theme so it doesn't blend into the background
6. Statistics numbers need to be dark/readable
7. The process timeline needs adjusted colors
8. All teal accents should work on both light and dark backgrounds
9. The footer should have a distinct background color in light theme (very light gray, not pure white)
10. The CTA section with banner should still have the dark overlay in light theme (it's a photo background, so it stays dark regardless)

**Test every section in light theme after making changes.**

---

## GLOBAL FIX 2 — SCROLL NAVIGATION

Add a scroll navigation component similar to Traqly's:

- Position: fixed, bottom-right corner
- Two buttons: scroll up (chevron up) and scroll down (chevron down)  
- Clicking scrolls smoothly to the previous/next major section
- Style: small, circular or rounded buttons, subtle background, EduCraft teal accent on hover
- Use icons from `react-icons` (e.g., `HiChevronUp`, `HiChevronDown` from Heroicons, or Lucide equivalents)
- Should be visible on both desktop and mobile
- Add a subtle glow or outline animation on the buttons (restrained, not flashy)
- Respect `prefers-reduced-motion`

---

## GLOBAL FIX 3 — ICONS

Audit the entire page. Replace ANY emoji characters used as icons with proper `react-icons` components. Install `react-icons` if not present:

```bash
npm install react-icons
```

Use ONE icon family consistently. Recommended: Lucide icons via `react-icons/lu`:

```tsx
import { LuGraduationCap, LuFileText, LuPresentation } from "react-icons/lu"
```

Or Phosphor icons via `react-icons/pi`:

```tsx
import { PiGraduationCap, PiFileText, PiPresentation } from "react-icons/pi"
```

Pick one family. Use it everywhere. No mixing.

---

## IMPLEMENTATION ORDER

1. Install `react-icons` if needed
2. Fix the hero (copy, document scroll-text, remove 45% line)
3. Fix the statistics (correct numbers, add count-up animation)
4. Fix the services section (add image reveal, improve layout)
5. Fix the process section (text update only)
6. Fix the specialists section (condense, make interactive)
7. Fix the quality control section (add chapter slider)
8. Fix the final CTA (banner background, remove metadata)
9. Fix the footer (contact info, slogan)
10. Add scroll navigation component
11. Complete light theme pass
12. Full responsive check (desktop → tablet → mobile)
13. Remove any remaining emoji icons
14. Final build verification — ensure no TypeScript errors, no console errors, page loads clean

---

## IMAGE FOLDER STRUCTURE

Create these folders if they don't exist. Leave a README.md in each noting that images should be added:

```
public/images/
├── fyb_img/           ← Final year project screenshots
├── ppt_img/           ← Presentation screenshots  
├── report_img/        ← Report/term paper screenshots
├── cv_img/            ← CV template images (download professional examples)
└── README.md          ← "Add EduCraft work sample images to the subfolders above"
```

If the image folders are empty, design the service hover to show a styled placeholder (service icon + "Preview coming soon" in muted text) rather than breaking.

---

## QUALITY CHECK

Before marking this complete:

- [ ] Hero documents have scrolling text content (not blank)
- [ ] Hero copy is updated (EduCraft brand-forward, no 45% line)
- [ ] Statistics show correct numbers (90+, 10+, 95%, 4.5)
- [ ] Statistics animate (count-up on viewport entry)
- [ ] Services show image previews on hover (or placeholders if images missing)
- [ ] Process step 01 text is updated
- [ ] Specialists section is condensed and interactive (not 8 full rows)
- [ ] QA section has chapter slider (Ch.1 through Ch.5) with animations
- [ ] CTA has banner background with dark gradient overlay
- [ ] CTA metadata block (45%, 3 rounds, Every file) is removed
- [ ] Footer has correct contact info and slogan
- [ ] Scroll navigation arrows are present (bottom-right)
- [ ] Light theme looks polished (not broken)
- [ ] All icons are from react-icons (zero emojis)
- [ ] No horizontal overflow on any viewport
- [ ] No TypeScript errors
- [ ] No console errors
- [ ] Mobile responsive and functional
