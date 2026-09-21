import * as React from "react";
import { ActionLink } from "@/components/primitives/ActionLink";
import { Reveal } from "@/components/primitives/Reveal";
import { HeroVisual } from "@/components/marketing/scene";

/**
 * Opening composition.
 *
 * Desktop: type holds the left half and the interactive paper stack sits in
 * the right half, vertically centred in a near-full-height hero.
 *
 * Mobile is composed separately rather than squeezed: shorter body copy, the
 * two actions stacked, and the paper stack moved beneath the text as a masked
 * band. The visual is still mounted exactly once — CSS repositions it — because
 * the sheets carry scroll-linked type and a second copy would run that work
 * off-screen for nothing.
 *
 * "EduCraft" is one word on one line at every width: `whitespace-nowrap` on the
 * heading, "Edu" in the page's ink and "Craft" in teal italic serif.
 */
export function Hero() {
  return (
    // The header is fixed and transparent at rest, so the hero cancels the
    // layout's header offset and runs its atmosphere up behind it.
    <section className="relative isolate grain -mt-[4.5rem] overflow-hidden">
      {/* Atmosphere — two light sources, no blobs */}
      <div aria-hidden className="ambient-teal pointer-events-none absolute inset-0 z-atmosphere" />
      <div aria-hidden className="ambient-gold pointer-events-none absolute inset-0 z-atmosphere" />

      <div className="shell grid-12 pb-[clamp(2.5rem,7vh,5rem)] pt-[clamp(6.5rem,16vh,9rem)] lg:min-h-[min(100svh,56rem)] lg:content-center lg:pb-[clamp(4rem,10vh,7rem)]">
        <div className="relative z-content col-span-4 md:col-span-10 lg:col-span-6">
          <Reveal>
            <p className="eyebrow flex items-center gap-2.5">
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
              Trusted by students across 10+ Nigerian universities
            </p>
          </Reveal>

          <Reveal delay={70} variant="wipe">
            <h1 className="mt-6 whitespace-nowrap font-sans text-[clamp(3rem,6.4vw,5rem)] font-extrabold leading-[0.95] tracking-[-0.045em] text-foreground">
              Edu
              <span className="accent-serif text-[1.08em] text-primary">Craft</span>
            </h1>
          </Reveal>

          <Reveal delay={130}>
            <p className="mt-4 font-display text-[clamp(1.25rem,2vw,1.5rem)] font-semibold leading-snug tracking-[-0.02em] text-foreground sm:mt-5">
              Academic &amp; Technical Documentation Experts
            </p>
          </Reveal>

          <Reveal delay={180}>
            {/* Phones get the short line; the full sentence is too long for 375px */}
            <p className="mt-4 max-w-[38ch] text-[15px] leading-[1.65] text-muted-foreground sm:hidden">
              Academic and technical work, researched, written and quality-reviewed by specialists.
            </p>
            <p className="mt-5 hidden max-w-[46ch] text-base leading-[1.7] text-muted-foreground sm:block lg:text-[1.0625rem]">
              Final year projects, seminar reports, presentations, CVs and more — researched,
              written and quality-reviewed by field specialists.
            </p>
          </Reveal>

          <Reveal delay={220}>
            <div className="mt-8 flex flex-col items-start gap-5 sm:mt-10 sm:flex-row sm:items-center sm:gap-9">
              <ActionLink href="/intake" variant="primary" magnetic>
                Start your project
              </ActionLink>
              <ActionLink href="/services">Browse services &amp; pricing</ActionLink>
            </div>
          </Reveal>
        </div>

        {/* One instance. A masked band beneath the copy on small screens;
            absolutely placed in the right half from lg up, clear of the
            header and the viewport edge so its shadows have room. */}
        <div className="relative col-span-4 mt-12 h-[88vw] max-h-[400px] w-full max-lg:mask-fade-b md:col-span-12 md:mx-auto md:max-w-[620px] lg:absolute lg:bottom-[8%] lg:right-[3%] lg:top-[14%] lg:z-atmosphere lg:mt-0 lg:h-auto lg:max-h-none lg:w-[48%] lg:max-w-none">
          <HeroVisual />
        </div>
      </div>

      {/* Foreground metadata, pinned to the visual rather than to a box */}
      <div className="pointer-events-none absolute bottom-[clamp(2rem,6vh,4rem)] right-[clamp(1.25rem,5vw,5rem)] z-overlay hidden items-center gap-4 lg:flex">
        <span aria-hidden className="h-px w-16 bg-hairline/25" />
        <div className="text-right">
          <p className="index-mark text-primary">CH. 01 / SHEET 42</p>
          <p className="mt-1 index-mark text-subtle">QUALITY REVIEW — PASSED</p>
        </div>
      </div>
    </section>
  );
}
