import * as React from "react";
import Image from "next/image";
import { ActionLink } from "@/components/primitives/ActionLink";
import { DisplayHeading, Eyebrow, Section } from "@/components/primitives/Section";
import { Reveal } from "@/components/primitives/Reveal";

/**
 * Closing statement.
 *
 * The page's one full-bleed dark block, in both themes — it is the loudest
 * moment and the last, and everything above has been building tonal contrast
 * toward it.
 *
 * The ground is the EduCraft banner under a two-stage gradient: a heavy wash
 * from the left where the type sits, and a lighter vertical wash that keeps the
 * top seam from cutting. Because the ground is a photograph, this block stays
 * dark in the light theme too — the overlay is doing the work, not the token.
 *
 * The banner is decorative, so it carries an empty alt and the section is
 * legible with the image absent.
 */
export function ClosingCta() {
  return (
    <Section ground="ink" rhythm="open" grain className="overflow-hidden">
      {/* Ground: the banner, held behind everything */}
      <div aria-hidden className="absolute inset-0 z-ground">
        <Image
          src="/images/educraft_banner.png"
          alt=""
          fill
          priority={false}
          sizes="100vw"
          className="object-cover object-center"
        />
      </div>

      {/* Legibility wash — horizontal for the type, vertical for the seam */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-atmosphere bg-[linear-gradient(to_right,hsl(var(--ink-deep)/0.78)_0%,hsl(var(--ink-deep)/0.42)_45%,hsl(var(--ink-deep)/0.08)_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-atmosphere bg-[linear-gradient(to_bottom,hsl(var(--ink-deep)/0.7)_0%,transparent_22%,transparent_78%,hsl(var(--ink-deep)/0.55)_100%)]"
      />
      {/* One localised light source, low and left */}
      <div aria-hidden className="ambient-ink pointer-events-none absolute inset-0 z-atmosphere" />

      <div className="shell relative z-content grid-12">
        <div className="col-span-4 md:col-span-8">
          <Reveal>
            <Eyebrow index="06">Start</Eyebrow>
          </Reveal>

          <Reveal delay={80} variant="wipe">
            <DisplayHeading
              className="mt-8"
              scale="display-sm"
              lines={["Start the project.", "Finish the degree."]}
            />
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-9 max-w-measure-lg text-lead text-muted-foreground">
              One form to begin. A specialist in your field, a mandatory quality
              review, and your finished work — with the balance due only at the end.
            </p>
          </Reveal>

          <Reveal delay={230}>
            <div className="mt-12 flex flex-wrap items-center gap-x-9 gap-y-5">
              <ActionLink href="/intake" variant="primary" magnetic>
                Start your project
              </ActionLink>
              <ActionLink href="/apply">Become an ambassador</ActionLink>
            </div>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
