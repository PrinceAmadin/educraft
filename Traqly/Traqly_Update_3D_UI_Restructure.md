# Traqly — Major Update: 3D Spatial UI Restructure ("2027 SaaS" Redesign)

## How to use this document

Paste this entire file into Claude Code. Build it in the **phase order** defined in Part 12 — do not skip ahead. Run every command yourself without asking permission. Run `npm run build` after every phase and confirm zero errors before pushing.

**Read this first — the single most important rule of this update:**

> 3D and heavy animation belong ONLY on marketing/landing pages that a visitor sees once. The working dashboard (analytics, links, social, studio, settings) must stay fast, flat, and lightweight. Never load Three.js, Spline, or GSAP ScrollTrigger inside the authenticated dashboard. The dashboard gets, at most, subtle CSS/Canvas-2D touches — never a live 3D scene.

This protects the app's core promise (fast redirects, fast dashboard) and protects mobile users on slow networks, who are the primary Traqly audience.

---

## Part 0 — Performance budget (non-negotiable guardrails)

Every 3D or animated feature in this document must obey these limits. If a feature cannot meet them, it ships as a static image instead.

1. **Mobile = no live 3D by default.** On screens below 768px, every Three.js scene is replaced with a pre-rendered static image (PNG/WebP) or a lightweight CSS animation. A phone must never download or run a Three.js scene unless the user explicitly opts in.
2. **Lazy-load all 3D.** No 3D library may be in the initial JS bundle. Every 3D component is loaded with `next/dynamic` + `ssr: false`, and only mounts when it scrolls into view (IntersectionObserver).
3. **Respect reduced motion.** If `prefers-reduced-motion: reduce` is set, all 3D and scroll animation is disabled and replaced with static content. This is an accessibility requirement, not optional.
4. **First load JS budget:** landing page route stays under 250kB first-load JS *excluding* the lazy 3D chunk. The 3D chunk loads after the page is interactive.
5. **Frame budget:** every scene must hold 60fps on desktop and degrade gracefully (lower particle counts) on lower-power devices using `navigator.hardwareConcurrency` and device pixel ratio caps.
6. **No 3D in `/dashboard`, `/links`, `/social`, `/studio`, `/settings`, `/admin`.** These stay flat and fast. The only motion allowed there is Framer Motion micro-interactions already in use.

If any phase risks violating these, stop and report before continuing.

---

## Part 1 — Audit the current codebase first

Before writing any new code, run these and show full output:

```bash
cat package.json
cat next.config.js 2>/dev/null || cat next.config.ts 2>/dev/null
cat tailwind.config.js 2>/dev/null || cat tailwind.config.ts 2>/dev/null
find app -name "page.tsx" -path "*landing*" -o -name "page.tsx" -path "*\(marketing\)*" 2>/dev/null | grep -v node_modules
ls app
cat app/page.tsx 2>/dev/null | head -100
find components -type d | grep -v node_modules
grep -rn "framer-motion\|gsap\|three\|@react-three" package.json
```

Then read the current landing page component(s) completely. Identify:
- Where the hero section lives
- Where the "Everything you need to grow" feature grid lives
- Where the FAQ and final CTA live
- What design tokens / CSS variables exist (brand color, surface colors, fonts)

Report what you found before proceeding. Reuse existing design tokens everywhere — never hardcode colors that already exist as CSS variables.

---

## Part 2 — Install the 3D + animation stack (marketing only)

Install these. They will be code-split and never reach the dashboard bundle.

```bash
npm install three @react-three/fiber @react-three/drei
npm install gsap
npm install lenis
npm install --save-dev @types/three
```

Notes for Claude Code:
- `@react-three/fiber` is the React renderer for Three.js.
- `@react-three/drei` gives helper components (cameras, controls, loaders).
- `gsap` powers scroll storytelling on marketing pages.
- `lenis` provides smooth scroll on marketing pages only — never wrap the dashboard in Lenis.
- Do NOT install Spline or Theatre.js. They are heavier and unnecessary for this scope; everything here is achievable with R3F + drei + GSAP.

After install, run `npm run build` to confirm nothing broke from the dependency addition. The bundle should not grow yet because nothing imports these libraries until later phases.

---

## Part 3 — Create the shared 3D infrastructure

Create a folder `components/three/` for all 3D building blocks. Build these shared utilities first so every scene reuses them:

**3a. A lazy 3D wrapper** — `components/three/Lazy3D.tsx`

A client component that:
- Accepts a `fallback` prop (the static image / CSS version shown on mobile and reduced-motion).
- Detects mobile (`window.innerWidth < 768`) and `prefers-reduced-motion`. If either is true, render only the fallback — never mount the 3D child.
- Uses an IntersectionObserver so the 3D child only mounts when scrolled into view, and unmounts when far out of view to free GPU memory.
- Wraps the 3D child in `next/dynamic(() => import(...), { ssr: false })`.

**3b. A device-tier hook** — `components/three/useDeviceTier.ts`

Returns `'low' | 'mid' | 'high'` based on `navigator.hardwareConcurrency`, `window.devicePixelRatio`, and screen size. Scenes use this to scale particle counts (e.g. low = 400 particles, mid = 1500, high = 4000) and to cap pixel ratio at 1.5 on low/mid tiers.

**3c. A canvas defaults wrapper** — `components/three/SceneCanvas.tsx`

A thin wrapper around R3F `<Canvas>` that sets sensible defaults: `dpr={[1, tierCap]}`, `gl={{ antialias: tier !== 'low', powerPreference: 'high-performance' }}`, `frameloop="demand"` where the scene is static, and a transparent background so it sits over the existing dark theme.

**3d. Brand palette for 3D** — read the existing CSS variables (brand purple/indigo, surface darks) and expose them as JS constants in `components/three/palette.ts` so every scene matches the existing brand exactly. Do not invent new colors.

---

## Part 4 — LANDING PAGE: The Living Traffic Network hero

This replaces the current hero gradient. It is the signature visual.

**Concept:** a dark spatial field of glowing nodes. Nodes represent clicks/visitors. Thin glowing lines connect clusters representing countries (Nigeria → Ghana → Kenya → UK → US). Particles travel along the lines toward a central Traqly node, conveying "traffic flowing into intelligence." The camera drifts slowly and reacts subtly to mouse position (parallax), never disorienting.

**Build** — `components/three/TrafficNetworkHero.tsx`:
- A particle system (Points) for the nodes, colored with the brand palette, with a soft additive glow.
- A set of curved lines (drei `<Line>` or custom buffer geometry) connecting cluster centroids, with animated dashes or traveling particles to show flow direction.
- A central, brighter node representing Traqly.
- Slow auto-rotation of the whole group; mouse moves the camera target by a few degrees max (damped with lerp).
- Particle count and line count scale by `useDeviceTier`.
- `frameloop="always"` here since it animates, but pause the loop when the hero is scrolled out of view.

**Overlay content (HTML, not 3D):** the headline "Know exactly who's clicking your links," the existing authentic subheadline, and the two CTA buttons sit in a normal absolutely-positioned HTML layer above the canvas. Text must stay crisp HTML — never render headline text inside Three.js.

**Mobile fallback (required):** below 768px, render a pre-made static hero — a beautiful still image of the network (export one rendered frame as WebP and store in `public/`), with the same headline and buttons over it, plus an optional very light CSS particle drift (pure CSS, no JS). The phone must not download Three.js for the hero.

**Mobile projection:** on a phone the hero is a full-width dark panel with the static network image faded into the background at ~40% opacity, headline centered, subheadline below, and the two buttons **side by side** (honoring your earlier requirement that they never stack), shrinking to icon+short-label if needed. Total hero height ≈ 85vh so the "scroll for more" affordance is visible.

---

## Part 5 — LANDING PAGE: Replace the feature grid with a Bento + product-world layout

Delete the current 3×2 identical-card grid. Replace the "Everything you need to grow" section with an **asymmetric bento grid** where tiles are different sizes to create hierarchy, and the largest tiles contain live mini-visualizations rather than just an icon and text.

**Bento layout (desktop), 12-column grid:**

```
┌─────────────────────────────┬───────────────┐
│  Real-time Analytics (LARGE)│ Fraud (TALL)  │
│  live mini area-chart        │ shield + bot  │
│  + counter ticking up        │ filter viz    │
├──────────────┬──────────────┤               │
│ Social Studio│ QR & Barcode │               │
│ phone w/ icons│ rotating QR  │               │
├──────────────┴──────────────┼───────────────┤
│ Link-in-Bio (WIDE)           │ Smart Share   │
│ stacked link preview         │ platform orbit│
└──────────────────────────────┴───────────────┘
```

**Tile contents — use lightweight Canvas-2D / SVG / CSS, NOT Three.js (these are many tiles; heavy 3D here would blow the budget):**

- **Real-time Analytics (large):** a small animated area chart (reuse the existing Recharts setup, lazy-loaded) with a number counter that ticks upward on view. Subhead rewritten without "every": "See who clicked, where they're from, and what device they're on — the moment it happens."
- **Fraud Protection (tall):** an SVG/CSS animation of dots entering, with red "bot" dots being filtered out and green "real" dots passing through a shield. Pure SVG + Framer Motion.
- **Social Link Studio:** a small CSS phone frame with brand social icons gently orbiting (CSS keyframes). Reuse the official simple-icons already in the codebase.
- **QR & Barcode Studio:** a single rotating QR code — CSS 3D transform `rotateY` loop, not Three.js. Cheap and effective.
- **Link-in-Bio:** a stacked-card CSS preview of a bio page.
- **Smart Share:** platform chips arranged in a ring around a center node, with one chip pulsing at a time (Framer Motion).

**Section subhead rewrite:** replace "Not just a shortener. Every feature exists to give you clearer numbers and smarter decisions." with: "One tool for every link you'll ever share — shortened, tracked, and ready to tell you what's actually working."

**Mobile projection:** the bento collapses to a single column. Tiles keep their mini-visualizations but the largest two (Analytics, Fraud) come first. The orbit/rotation animations downgrade to static or very light CSS. No tile loads Three.js. Each tile is full-width with comfortable vertical spacing; the section never causes horizontal scroll.

---

## Part 6 — LANDING PAGE: Scroll-storytelling product sections (GSAP + Lenis)

Below the bento, add 2–3 full-width "product story" sections that animate as the user scrolls. This is where the premium feel lives.

**Setup:**
- Wrap ONLY the marketing page tree in a Lenis smooth-scroll provider. Never apply Lenis globally or to the dashboard.
- Use GSAP ScrollTrigger, registered client-side only, lazy-loaded.

**Story Section 1 — "Watch traffic arrive in real time":**
- A large mock analytics dashboard panel (a styled HTML/CSS mock, or a screenshot of the real dashboard placed in `public/`).
- As the user scrolls, numbers count up, a chart line draws itself, and small country rows fade in one by one (Nigeria, Ghana, UK...).
- Copy on the side, pinned briefly while the visual animates.

**Story Section 2 — "Fraud never touches your numbers":**
- A visualization (SVG/Canvas-2D) of incoming traffic where bots are visibly filtered out and a "143 bots filtered" counter animates.

**Story Section 3 (optional) — "One link, tracked everywhere":**
- The Smart Share concept enlarged: social platforms feeding a central link, particles flowing (Canvas-2D is enough; Three.js optional and desktop-only).

**Mobile projection:** ScrollTrigger pinning is disabled on mobile (pinning feels broken on touch). Instead each story section becomes a simple stacked block: headline, static product image, short copy, with a single fade-in-on-view (Framer Motion `whileInView`). Lenis smooth scroll stays on but with reduced intensity. No pinned/scrubbed animations on phones.

---

## Part 7 — LANDING PAGE: Animated FAQ + redesigned final CTA

**FAQ:** keep the existing questions. Add the Framer Motion accordion animation (height auto expand/collapse, chevron rotate, subtle left brand border on the open item, slight x-nudge on hover). This was previously specced — confirm it is implemented and animated, not static.

**Final CTA — replace the flat panel with the "living data card" treatment:**
- Left: headline "Your links are already telling a story." + subtext + "Create your free account" button + "No credit card. Free forever on the basic plan."
- Right: a floating analytics card (HTML/CSS, with a subtle Framer Motion float loop) showing "Today's clicks 2,847", a small sparkline, top source, and "143 bots filtered." Add a soft radial brand glow behind it.
- Desktop: side by side. Mobile: stack, card below text, float animation reduced.

This already partially exists from earlier work — refine it to match, do not duplicate.

---

## Part 8 — SIGNATURE 3D PIECE: Interactive Analytics Globe (marketing + opt-in dashboard)

The 3D globe is the highest-impact spatial visual and maps perfectly to Traqly's geography feature.

**Build** — `components/three/AnalyticsGlobe.tsx`:
- A sphere with a dark, dotted/wireframe earth texture in brand tones.
- Pulsing hotspots at country coordinates (start with NG, GH, KE, UK, US).
- Animated arcs/beams between hotspots representing traffic, using drei or custom curved lines with traveling glow.
- Slow auto-rotation; drag to rotate on desktop (drei `OrbitControls` with damping, zoom disabled to stay controlled).
- Hotspot size/brightness scales by click volume passed in as props.

**Where it lives:**
1. **Marketing:** a dedicated "See your audience on a map" section on the landing page (desktop full 3D, mobile static globe image).
2. **Dashboard (opt-in only):** on the analytics geography view, show the existing fast country table/donut BY DEFAULT. Add a small "View as globe" toggle. Only when the user clicks it do you lazy-load the globe (desktop only). The default analytics experience stays flat and instant — the globe is a delightful extra, never the default load.

**Mobile projection:** on phones the globe is a static rendered image (one exported frame) with the country list below it. Tapping a "globe" toggle on mobile shows the static image larger, not a live scene. Never run the live globe on mobile.

---

## Part 9 — SELECTIVE dashboard enhancements (lightweight only)

The dashboard stays flat and fast. These are the ONLY enhancements allowed, and none use Three.js:

**9a. Living mesh background (very subtle, desktop only):**
- A low-opacity Canvas-2D network mesh that drifts slowly behind the dashboard content, reacting faintly to mouse movement. Opacity ≤ 6%. Disabled on mobile, on reduced-motion, and on low device tier. Must add zero perceptible jank — if it costs frames, it gets cut.

**9b. Leaderboard podium polish (CSS 3D, not Three.js):**
- Elevate rank #1 with a CSS `transform` raised platform, a floating crown (the existing icon), and a subtle glow. Ranks #2/#3 lower. Pure CSS + Framer Motion. No Three.js.

**9c. Link analytics "data reactor" (optional, CSS/SVG):**
- The five stat cards (Today, This Week, Total Unique, Data Quality, Streak) can be arranged with concentric SVG rings that fill based on performance — a HUD feel — but implemented as animated SVG, not 3D. Keep it optional; if it adds complexity or slowness, ship the existing cards.

**9d. Achievement vault (CSS/SVG glassmorphism):**
- Earned achievements render as glowing glass artifacts in a grid with hover lift and shine (CSS). Locked ones are dimmed. No Three.js — CSS glass + Framer Motion only.

**Mobile projection for dashboard:** mesh background OFF. Podium stays (CSS scales down — #1 still elevated but less dramatic). Data-reactor rings collapse back to the normal stacked stat cards on narrow screens. Achievement vault becomes a 2-column grid. Everything stays instant.

---

## Part 10 — SIGNATURE 3D PIECE: Social Studio phone (desktop marketing only)

On the **marketing** Social Link feature section (not the working `/social` page), show a 3D phone floating with social icons orbiting. Clicking an icon rotates the phone and swaps the preview. This is a showcase, not the real tool.

- Build with R3F: a simple phone mesh (rounded box geometry + screen plane), icons as billboards orbiting, smooth rotate-on-select via GSAP/lerp.
- The actual working `/social` page keeps its existing fast 2D phone preview — do NOT replace the functional one with 3D.

**Mobile projection:** static image of the phone with icons; tapping an icon swaps a 2D preview image. No live 3D.

---

## Part 11 — Global polish layer (applies to marketing pages)

- **Glassmorphism surfaces:** marketing cards/panels get layered translucent glass (backdrop-blur, subtle inner border, soft shadow) using existing surface tokens.
- **Depth & parallax:** marketing sections get gentle scroll parallax (Framer Motion `useScroll` + transforms), desktop only.
- **Consistent easing:** define one shared easing curve and one duration scale; apply across all marketing animations so motion feels designed, not random.
- **Loading states:** any 3D scene shows a tasteful skeleton/blur-up while its chunk loads, never a blank gap.

---

## Part 12 — BUILD ORDER (strict — do not reorder)

Build, `npm run build`, and visually verify after EACH phase. Commit after each successful phase. Push at the end of each phase so you can roll back if one phase regresses.

1. **Phase 1 — Infrastructure:** Part 1 audit + Part 2 install + Part 3 shared 3D infra (`Lazy3D`, `useDeviceTier`, `SceneCanvas`, `palette`). Build must pass with these unused. Commit: "3D infra + lazy/mobile guards."
2. **Phase 2 — Bento + copy rewrite (NO 3D yet):** Part 5 bento grid with Canvas-2D/SVG/CSS mini-visuals + all copy rewrites. This is the biggest perceived upgrade and carries no 3D risk. Commit: "Bento feature grid + copy."
3. **Phase 3 — FAQ + final CTA:** Part 7. Commit: "Animated FAQ + living-data CTA."
4. **Phase 4 — Scroll storytelling:** Part 6 (Lenis on marketing tree + GSAP story sections, mobile = stacked fade-in). Commit: "Scroll storytelling sections."
5. **Phase 5 — Traffic Network hero:** Part 4 (desktop live, mobile static). This is the first true 3D — verify mobile loads the static fallback and never the Three.js chunk. Commit: "3D traffic-network hero + mobile fallback."
6. **Phase 6 — Analytics Globe:** Part 8 (marketing section + opt-in dashboard toggle, mobile static). Commit: "3D analytics globe (opt-in)."
7. **Phase 7 — Dashboard lightweight polish:** Part 9 (CSS/SVG/Canvas-2D only — mesh bg, podium, reactor, vault). Commit: "Dashboard CSS/SVG polish."
8. **Phase 8 — Social Studio phone + global polish:** Part 10 + Part 11. Commit: "Social studio 3D showcase + glass polish."

After Phase 8:
```bash
npm run build
```
Show the full route-size table. Confirm:
- The landing route's base first-load JS (excluding lazy 3D chunks) is under 250kB.
- Three.js appears only in code-split chunks, never in the dashboard routes.
- `/dashboard`, `/links`, `/social`, `/studio`, `/admin` first-load JS did not increase meaningfully.

Then:
```bash
git add .
git commit -m "Complete 3D spatial UI restructure — marketing 3D, lightweight dashboard polish, full mobile fallbacks"
git push
```

---

## Part 13 — Verification checklist (run before declaring done)

Test all of these and report results:

1. Desktop landing: hero network renders, 60fps, mouse parallax works.
2. Mobile landing (resize to 375px or real phone): hero shows STATIC image — open DevTools Network tab and confirm `three` chunk did NOT download.
3. Reduced motion (OS setting on): all 3D/scroll animation disabled, static content shown.
4. Bento grid: asymmetric on desktop, single column on mobile, no horizontal scroll, mini-visuals animate.
5. Scroll storytelling: pinned/scrubbed on desktop, simple stacked fade-in on mobile.
6. Globe: live on desktop marketing; analytics page shows table by default with working "View as globe" toggle; mobile shows static globe image.
7. Dashboard: NO Three.js chunk loads on any dashboard route (verify in Network tab). Route transitions still feel instant.
8. Low-end simulation (Chrome DevTools CPU 4× throttle + mobile): landing remains usable, no frozen frames.
9. Lighthouse on landing (mobile): performance score should not collapse — target 70+ on mobile even with the static fallback hero.
10. FAQ accordion animates; final CTA card floats.

If any check fails — especially #2, #6, #7 (the mobile/dashboard performance guards) — fix it before declaring the update complete. Those guards are the reason this update is safe to ship.

---

## Part 14 — What we deliberately did NOT do, and why

So future-you understands the choices:

- **No 3D on the working dashboard.** It's used daily; speed beats spectacle there.
- **No live 3D on mobile.** Your audience is on mobile networks; static fallbacks keep them fast.
- **No Spline / Theatre.js.** R3F + drei + GSAP cover everything here with less weight.
- **3D globe and traffic network are the two "wow" pieces** — concentrated impact instead of 3D everywhere, which is what separates a premium product from a gimmicky one.

This gives Traqly a genuine 2027 marketing surface while keeping the product itself fast, professional, and usable — which is the actual reason people will stay.
