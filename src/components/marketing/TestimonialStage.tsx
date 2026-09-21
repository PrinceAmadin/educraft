"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Eyebrow, Section } from "@/components/primitives/Section";
import { Reveal } from "@/components/primitives/Reveal";
import { IconArrowLeft, IconArrowRight } from "@/lib/icons";
import { TESTIMONIALS } from "@/lib/marketing";
import { cn } from "@/lib/utils";

/**
 * Student voice.
 *
 * One quote at a time, at statement scale. Three testimonials side by side
 * would make each of them a caption; a single dominant voice is the only
 * arrangement where the words are actually read.
 *
 * It does not auto-advance. A rotating quote steals the reader's place in a
 * sentence, and the design gains nothing from motion the reader did not ask
 * for. Navigation is explicit, keyboard-reachable and announced.
 */
export function TestimonialStage() {
  const [index, setIndex] = React.useState(0);
  const [direction, setDirection] = React.useState(1);
  const reduced = useReducedMotion();
  const total = TESTIMONIALS.length;
  const current = TESTIMONIALS[index];

  const go = (delta: number) => {
    setDirection(delta);
    setIndex((prev) => (prev + delta + total) % total);
  };

  const shift = reduced ? 0 : 26;

  return (
    <Section ground="a" rhythm="normal" aria-label="Student voice">
      {/* Every other section contributes an <h2> to the outline; this one's
          title is carried visually by the eyebrow, so the heading is here for
          screen-reader and outline navigation rather than omitted. */}
      <h2 className="sr-only">What students say</h2>

      <div className="shell grid-12">
        <div className="col-span-4 md:col-span-3">
          <Reveal>
            <Eyebrow index="05">Student voice</Eyebrow>
          </Reveal>

          <Reveal delay={90} className="mt-10 hidden md:block">
            <p className="tabular text-sm text-subtle">
              <span className="text-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="mx-1.5">/</span>
              {String(total).padStart(2, "0")}
            </p>
            <Controls onPrev={() => go(-1)} onNext={() => go(1)} className="mt-6" />
          </Reveal>
        </div>

        <div className="relative col-span-4 mt-10 md:col-span-8 md:col-start-5 md:mt-0">
          {/* Oversized quote mark, set behind the type as a ground element */}
          <span
            aria-hidden
            className="pointer-events-none absolute -left-2 -top-16 select-none font-serif text-[clamp(9rem,16vw,15rem)] leading-none text-primary/[0.09] md:-left-14 md:-top-24"
          >
            &ldquo;
          </span>

          <div className="relative min-h-[clamp(14rem,26vh,20rem)]" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.figure
                key={index}
                initial={{ opacity: 0, y: shift * direction }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -shift * direction }}
                transition={{ duration: reduced ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                <blockquote className="max-w-[26ch] font-display text-[clamp(1.5rem,3vw,2.75rem)] font-medium leading-[1.16] tracking-[-0.03em] text-foreground">
                  {current.quote}
                </blockquote>

                <figcaption className="mt-10 flex flex-wrap items-baseline gap-x-6 gap-y-2">
                  <span className="index-mark text-primary">{current.initials}</span>
                  <span className="text-sm text-muted-foreground">{current.programme}</span>
                  <span className="text-sm text-subtle">{current.institution}</span>
                </figcaption>
              </motion.figure>
            </AnimatePresence>
          </div>

          {/* Ticks double as the progress indicator and the direct selector */}
          <div className="mt-12 flex items-center gap-8">
            <div className="flex gap-2.5">
              {TESTIMONIALS.map((testimonial, i) => (
                <button
                  key={testimonial.initials}
                  type="button"
                  onClick={() => {
                    setDirection(i > index ? 1 : -1);
                    setIndex(i);
                  }}
                  aria-label={`Show testimonial ${i + 1} of ${total}`}
                  aria-current={i === index}
                  className="group/tick py-2.5"
                >
                  <span
                    className={cn(
                      "block h-px transition-all duration-normal ease-editorial",
                      i === index
                        ? "w-12 bg-primary"
                        : "w-7 bg-hairline/30 group-hover/tick:bg-hairline/60"
                    )}
                  />
                </button>
              ))}
            </div>

            <Controls onPrev={() => go(-1)} onNext={() => go(1)} className="md:hidden" />
          </div>
        </div>
      </div>
    </Section>
  );
}

function Controls({
  onPrev,
  onNext,
  className,
}: {
  onPrev: () => void;
  onNext: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <ControlButton label="Previous testimonial" onClick={onPrev}>
        <IconArrowLeft aria-hidden className="size-[18px]" />
      </ControlButton>
      <ControlButton label="Next testimonial" onClick={onNext}>
        <IconArrowRight aria-hidden className="size-[18px]" />
      </ControlButton>
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      // 44px target; the visible mark is the ring, which is the one place on
      // the page a circle is the right shape — it is a dial, not a container.
      className="flex size-11 items-center justify-center rounded-full text-muted-foreground ring-1 ring-hairline/20 transition-colors duration-fast hover:text-foreground hover:ring-hairline/45"
    >
      {children}
    </button>
  );
}
