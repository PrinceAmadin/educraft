"use client";

import * as React from "react";
import { DisplayHeading, Eyebrow, Section } from "@/components/primitives/Section";
import { Reveal } from "@/components/primitives/Reveal";
import { PROCESS } from "@/lib/marketing";
import { cn } from "@/lib/utils";

/**
 * Process — a spatial timeline.
 *
 * Five stages read vertically against a rail that fills as you descend, with a
 * sticky panel on the left carrying the stage you are currently inside. The
 * progression is the point: four cards in a row would say these things happen
 * in parallel.
 *
 * The active stage is decided by an IntersectionObserver band across the middle
 * of the viewport — one observer, no scroll handler, no per-frame work. The
 * rail's fill is a stepped transform rather than a continuous scroll binding,
 * which reads as a process advancing rather than as a progress bar.
 *
 * Every stage is fully legible at all times. Only the marker and the stage
 * title change state; body copy never dims below its readable value.
 */
export function ProcessTimeline() {
  const [active, setActive] = React.useState(0);
  const stageRefs = React.useRef<(HTMLLIElement | null)[]>([]);

  React.useEffect(() => {
    const nodes = stageRefs.current.filter(Boolean) as HTMLLIElement[];
    if (!nodes.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Number((entry.target as HTMLElement).dataset.index);
            if (!Number.isNaN(index)) setActive(index);
          }
        });
      },
      // A narrow band through the middle of the viewport: whichever stage is
      // crossing the reader's eye line is the active one.
      { rootMargin: "-46% 0px -46% 0px", threshold: 0 }
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  const current = PROCESS[active];
  const CurrentIcon = current.icon;

  return (
    <Section id="how-it-works" ground="b" rhythm="open">
      <div className="shell grid-12">
        {/* Sticky stage panel — the section's fixed point */}
        <div className="col-span-4 md:col-span-4">
          <div className="md:sticky md:top-[clamp(6rem,18vh,11rem)]">
            <Reveal>
              <Eyebrow index="02">How it works</Eyebrow>
              <DisplayHeading
                className="mt-7"
                scale="headline"
                lines={["Five stages.", "No chasing."]}
              />
            </Reveal>

            {/* Supporting content transitions with the stage. Hidden on small
                screens, where the stage list is already the whole view. */}
            <div className="mt-14 hidden items-start gap-6 md:flex">
              <span
                key={`n-${active}`}
                className="tabular text-[clamp(3rem,5vw,4.5rem)] font-medium leading-none text-primary"
              >
                {current.index}
              </span>
              <div key={`m-${active}`} className="pt-2">
                <CurrentIcon aria-hidden className="size-5 text-primary" />
                <p className="mt-4 index-mark text-subtle">{current.meta.toUpperCase()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stage list */}
        <ol className="relative col-span-4 mt-16 md:col-span-7 md:col-start-6 md:mt-0">
          {/* Rail. The dim track is always present; the teal fill advances. */}
          <span
            aria-hidden
            className="absolute left-0 top-2 h-[calc(100%-1rem)] w-px bg-hairline/14"
          />
          <span
            aria-hidden
            className="absolute left-0 top-2 w-px origin-top bg-primary transition-transform duration-slow ease-editorial"
            style={{
              height: "calc(100% - 1rem)",
              transform: `scaleY(${(active + 1) / PROCESS.length})`,
            }}
          />

          {PROCESS.map((step, i) => {
            const isActive = i === active;
            return (
              <li
                key={step.index}
                data-index={i}
                ref={(node) => {
                  stageRefs.current[i] = node;
                }}
                className="relative pb-16 pl-8 last:pb-0 md:pl-12"
              >
                {/* Marker. Grows and fills when the stage is under the eye line. */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-0 top-[0.55rem] block -translate-x-1/2 rounded-full transition-all duration-normal ease-editorial",
                    isActive
                      ? "size-[9px] bg-primary shadow-[0_0_0_5px_hsl(var(--primary)/0.14)]"
                      : "size-[5px] bg-hairline/40"
                  )}
                />

                <div className="flex items-baseline gap-4">
                  <span
                    className={cn(
                      "index-mark transition-colors duration-normal",
                      isActive ? "text-primary" : "text-subtle"
                    )}
                  >
                    {step.index}
                  </span>
                  <h3
                    className={cn(
                      "font-display text-[clamp(1.375rem,2.4vw,2rem)] font-medium tracking-[-0.03em] transition-colors duration-normal",
                      isActive ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {step.title}
                  </h3>
                </div>

                <p className="mt-4 max-w-measure-lg text-[0.9375rem] leading-relaxed text-muted-foreground">
                  {step.body}
                </p>

                <p className="mt-5 index-mark text-subtle md:hidden">
                  {step.meta.toUpperCase()}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </Section>
  );
}
