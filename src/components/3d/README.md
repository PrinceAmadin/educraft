# The document scene

A WebGL layer for the EduCraft hero. It is not decoration attached to the page —
it is one idea, rendered spatially: **an academic document, held in depth, that
reorganises itself into whatever the studio is being asked to produce.**

Nothing in it is generic 3D. There are no particles, no blobs, no orbiting
geometry, no glass. There are sheets of paper with real type on them, lit like a
still life, in a room with an archive behind it.

Run it at **`/scene-preview`**. That route is a harness, not a page — it holds
the scene, a service index that drives it, and enough scroll to evaluate the
camera. It is deliberately not wired into `(public)/page.tsx`.

---

## What is actually on screen

Five spatial layers, front to back:

| Layer | Module | Purpose |
| --- | --- | --- |
| Metadata | `SpatialMetadata.tsx` | Folios, reference numbers, review status. The lightest layer, so it answers the pointer hardest. |
| Document | `AcademicDocuments.tsx` → `DocumentLayer.tsx` | Seven typeset sheets. The subject. |
| Light | `SceneLighting.tsx` | Four-light still-life rig; the key drifts with the pointer. |
| Atmosphere | `Atmosphere.tsx` | One hand-written shader: a light pool, a ruled ledger field, fibre grain. |
| Archive | `ArchiveField.tsx` | A strict instanced grid, far back, dissolving into fog. |

The sheets are **not images**. `lib/scene/paper.ts` typesets each page onto a 2D
canvas at run time — justified body copy, running heads, a block quotation with
its citation, a figure with two plotted series, a five-row table, hanging-indent
references — and uploads it as a texture. That is why the composition is correct
in both themes without a second set of assets, and why the chapter heading is
still legible when the camera comes close.

## The state machine

Every service reorganises the same seven sheets. From `lib/scene/composition.ts`:

```
rest           a fanned stack on a desk
projects       a chapter ladder, stepped deep in z    → volume, structure
reports        one tight block, references pulled out → a single bound thing
presentations  a stepped sequence of small frames     → slides, in order
career         one sheet forward and alone            → one page about you
editing        an overlapped pile, reviewer's marks   → work being corrected
combos         three clusters held in one field       → a bundle
```

Nothing is captioned. The geometry carries the meaning, which is the difference
between a spatial system and floating labels.

## Wiring it into a page

Two things:

```tsx
const hero = useRef<HTMLElement>(null);

<section ref={hero} className="relative isolate overflow-hidden">
  <EduCraftScene progressRef={hero} className="absolute inset-y-0 right-0 w-[56%]" />
  …
</section>
```

and, on whatever the user points at:

```tsx
const { focus, release } = useSceneStore.getState();

onPointerEnter={() => focus("projects", rowId)}
onPointerLeave={() => release(rowId)}
```

`release` only clears if the caller still owns the state, so moving between two
adjacent rows never flickers through `rest`.

Import `EduCraftScene` through `next/dynamic` with `ssr: false`. It is ~150KB of
renderer and must never be on the critical path — the headline is the LCP
element.

## Motion

All of it is exponential damping (`lib/scene/damp.ts`), never per-frame lerp, so
the scene behaves identically at 60Hz and 144Hz. Damping rates are a hierarchy,
not a preference:

```
camera 1.6   <  sheets 2.6  <  metadata 4.5
heaviest        the subject     lightest
```

Because the layers catch up at different rates, a state change reads as parallax
between them rather than as one group being re-laid-out. Raw pointer input is
damped exactly once, in `useSceneInteraction.ts`, into a single shared field;
every layer scales that one value by its own depth.

The camera never orbits. It moves *against* the pointer — push right and it
slides left — so the composition appears to hold still while the space around it
shifts.

## Budget

`useResponsiveScene.ts` resolves one profile on mount and the scene spends it:

- DPR clamped to 1.75 (1.5 on phones). Retina devices will happily render 3× and melt.
- 7 sheets at 896px textures on desktop; 5 at 512px on phones.
- Shadows and the archive grid are the first two things dropped.
- The render loop is gated on an IntersectionObserver — a canvas scrolled past costs nothing.
- `prefers-reduced-motion` switches to `frameloop="demand"`: the composition still
  *assembles*, then the GPU goes idle on a still image.
- Software rasterisers (SwiftShader, llvmpipe) are treated as no WebGL at all.
- Every geometry, material and texture is disposed on unmount; texture disposal is
  keyed on the texture set, so a theme swap never releases a texture a mesh is
  still pointing at.

## Without WebGL

`SceneFallback.tsx` is not a placeholder. It is the same idea in three
transformed elements and a hairline, with the top sheet set in real HTML. It
renders during SSR, before the first frame, and permanently on machines that
cannot give us a context. If the page only works with the canvas running, the
canvas is carrying the design rather than supporting it.
