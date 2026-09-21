"use client";

import * as React from "react";
import { DisplayHeading, Eyebrow, Section } from "@/components/primitives/Section";
import { motion, useReducedMotion } from "framer-motion";
import { Reveal } from "@/components/primitives/Reveal";
import { ChapterSlider } from "@/components/marketing/ChapterSlider";
import { ANNOTATIONS } from "@/lib/marketing";
import { cn } from "@/lib/utils";

/**
 * Quality control — an annotated document.
 *
 * The section's visual idea is a manuscript on a reviewer's desk with margin
 * notes pinned around it. The checks are set as editorial annotations with
 * leader lines running to the page, not as dashboard widgets: the point is
 * that a person read this, and annotations are what reading leaves behind.
 *
 * Below `md` the leader lines are dropped entirely and the annotations become
 * a lettered index under the document — the same information in the
 * composition that 390px can actually hold.
 *
 * The document itself is a five-chapter slider: the review is a pass over a
 * whole report, and showing one static page understated it.
 */

export function QualityControl() {
  // Held here rather than inside the slider so the margin annotations can
  // re-cue with the page they describe.
  const [chapter, setChapter] = React.useState(0);
  const reduced = useReducedMotion();
  const onChange = React.useCallback((i: number) => setChapter(i), []);

  return (
    <Section ground="b" rhythm="open" grain>
      <div className="shell">
        <div className="grid-12">
          <Reveal className="col-span-4 md:col-span-6">
            <Eyebrow index="04">Quality control</Eyebrow>
            <DisplayHeading
              className="mt-7"
              scale="display-sm"
              lines={["Nothing reaches", "you unchecked."]}
            />
          </Reveal>
          <Reveal
            delay={110}
            className="col-span-4 mt-8 self-end md:col-span-4 md:col-start-9 md:mt-0"
          >
            <p className="max-w-measure text-[0.9375rem] leading-relaxed text-muted-foreground">
              Every deliverable passes a review against your department&rsquo;s own
              requirements before it is released — every chapter, every reference,
              by a person.
            </p>
          </Reveal>
        </div>

        {/* Composition field. Annotations are positioned against this box. */}
        <div className="relative mt-20 md:mt-28 md:min-h-[640px]">
          <div className="grid-12">
            <div className="col-span-4 md:col-span-4 md:col-start-5">
              <Reveal>
                <ChapterSlider onChange={onChange} />
              </Reveal>
            </div>
          </div>

          {/* Desktop: margin annotations with leader lines.
              Only one of the two arrangements is ever in the accessibility
              tree — `display: none` removes the other — so the content is
              announced exactly once at every viewport. */}
          <ul className="absolute inset-0 hidden md:block">
            {ANNOTATIONS.map((annotation, i) => {
              const isLeft = annotation.at.side === "left";
              return (
                <Reveal
                  as="li"
                  key={annotation.id}
                  delay={260 + i * 110}
                  className={cn(
                    "absolute flex w-[30%] items-start gap-4",
                    isLeft ? "left-0 flex-row" : "right-0 flex-row-reverse"
                  )}
                  style={{ top: annotation.at.top }}
                >
                  <motion.div
                    key={`${annotation.id}-${chapter}`}
                    // A re-check, not a re-entry: the labels lift and settle
                    // rather than flying back in every five seconds.
                    initial={reduced ? false : { opacity: 0.45, x: isLeft ? -6 : 6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 340,
                      damping: 30,
                      delay: reduced ? 0 : i * 0.07,
                    }}
                    className={cn("flex-1", isLeft ? "text-right" : "text-left")}
                  >
                    <p className="index-mark text-primary">
                      {annotation.id} — {annotation.label.toUpperCase()}
                    </p>
                    <p className="mt-2 text-[0.8125rem] leading-relaxed text-subtle">
                      {annotation.note}
                    </p>
                  </motion.div>

                  {/* Leader line running to the sheet */}
                  <span
                    aria-hidden
                    className="mt-[7px] flex w-[clamp(1.5rem,4vw,3.5rem)] shrink-0 items-center"
                  >
                    <span className="h-px flex-1 bg-hairline/25" />
                    <span className="size-1 shrink-0 rounded-full bg-primary" />
                  </span>
                </Reveal>
              );
            })}
          </ul>

          {/* Mobile: the same annotations as a lettered index */}
          <ul className="mt-16 md:hidden">
            {ANNOTATIONS.map((annotation, i) => (
              <Reveal
                as="li"
                key={annotation.id}
                delay={i * 60}
                className="flex gap-5 border-t border-hairline/12 py-5"
              >
                <span className="index-mark shrink-0 pt-0.5 text-primary">
                  {annotation.id}
                </span>
                <div>
                  <p className="text-[0.9375rem] font-medium text-foreground">
                    {annotation.label}
                  </p>
                  <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-subtle">
                    {annotation.note}
                  </p>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
