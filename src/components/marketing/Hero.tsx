import * as React from "react";
import { ActionLink } from "@/components/primitives/ActionLink";
import { Reveal } from "@/components/primitives/Reveal";
import { HeroVisual } from "@/components/marketing/scene";

/**
 * Opening composition.
 *
 * Asymmetric: type occupies columns 1–7, the workspace occupies 6–13 and bleeds
 * past the right viewport edge. The overlap in columns 6–7 is deliberate — the
 * receding sheets pass *behind* the headline, which establishes the z-order of
 * the whole page in the first second.
 *
 * Mobile is not this layout collapsed. The type block leads at full width and
 * the workspace becomes a band beneath it, masked into the ground, because a
 * side-by-side split at 390px would starve both halves.
 *
 * The visual is mounted exactly once and repositioned by CSS rather than
 * rendered twice behind a `hidden` class — the sheets carry scroll-linked type
 * and a second copy would run that work off-screen for nothing.
 */
export function Hero() {
  return (
    // The header is fixed and transparent at rest, so the hero cancels the
    // layout's header offset and runs its atmosphere up behind it. Top
    // clearance is then one number, set below.
    <section className="relative isolate grain -mt-[4.5rem] overflow-hidden">
      {/* Z1 — atmosphere. Two light sources, no blobs. */}
      <div aria-hidden className="ambient-teal pointer-events-none absolute inset-0 z-atmosphere" />
      <div aria-hidden className="ambient-gold pointer-events-none absolute inset-0 z-atmosphere" />

      <div className="shell grid-12 pb-[clamp(3.5rem,9vh,7rem)] pt-[clamp(8rem,20vh,13rem)]">
        <div className="relative z-content col-span-4 md:col-span-7">
          <Reveal>
            <p className="eyebrow flex items-center gap-3">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
              Trusted by students across 10+ Nigerian universities
            </p>
          </Reveal>

          {/*
            The brand name is the headline. Two lines, set as large as the
            column allows — "Edu" in the page's own ink, "Craft" in teal
            italic serif, so the mark reads as one word with two voices.
            `leading-[0.82]` closes the gap to a single lockup rather than two
            stacked words.
          */}
          <Reveal delay={70} variant="wipe">
            <h1 className="mt-8 font-display text-[clamp(4rem,11vw,10.5rem)] font-semibold leading-[0.82] tracking-[-0.05em] text-foreground">
              <span className="block">Edu</span>
              <span className="accent-serif block font-normal text-primary">Craft</span>
            </h1>
          </Reveal>

          <Reveal delay={140}>
            <p className="mt-9 font-display text-[clamp(1.25rem,2.4vw,2rem)] font-medium leading-[1.15] tracking-[-0.03em] text-foreground md:mt-11">
              Academic &amp; Technical Documentation Experts
            </p>
          </Reveal>

          <Reveal delay={190}>
            <p className="mt-5 max-w-measure-lg text-lead text-muted-foreground">
              Final year projects, seminar reports, presentations, CVs and more —
              researched, written and quality-reviewed by field specialists.
            </p>
          </Reveal>

          <Reveal delay={210}>
            <div className="mt-11 flex flex-wrap items-center gap-x-9 gap-y-5">
              <ActionLink href="/intake" variant="primary" magnetic>
                Start your project
              </ActionLink>
              <ActionLink href="/services">Browse services &amp; pricing</ActionLink>
            </div>
          </Reveal>

        </div>

        {/* One instance. In flow as a masked band on small screens; absolutely
            placed and bleeding off the right edge from lg up. */}
        <div className="relative col-span-4 mt-14 h-[78vw] max-h-[420px] w-full max-lg:mask-fade-b md:col-span-12 lg:absolute lg:inset-y-0 lg:right-[-8%] lg:z-atmosphere lg:mt-0 lg:h-auto lg:max-h-none lg:w-[58%]">
          <HeroVisual />
        </div>
      </div>

      {/* Z4 — foreground metadata, pinned to the visual rather than to a box */}
      <div className="pointer-events-none absolute bottom-[clamp(2rem,7vh,4.5rem)] right-[clamp(1.25rem,5vw,5rem)] z-overlay hidden items-center gap-4 lg:flex">
        <span aria-hidden className="h-px w-16 bg-hairline/25" />
        <div className="text-right">
          <p className="index-mark text-primary">CH. 03 / SHEET 42</p>
          <p className="mt-1 index-mark text-subtle">QUALITY REVIEW — PASSED</p>
        </div>
      </div>
    </section>
  );
}
