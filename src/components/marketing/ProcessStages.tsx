"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const STAGES = [
  {
    index: "01",
    title: "Tell us what you need",
    body: "One guided form captures your topic, supervisor, department format and files. No long back-and-forth on WhatsApp.",
    aside: "5–8 minutes",
  },
  {
    index: "02",
    title: "We assign the right specialist",
    body: "Your brief is matched to a writer who has worked in your discipline — by department, method and the tools your project needs.",
    aside: "Within 24 hours",
  },
  {
    index: "03",
    title: "Research and development",
    body: "Chapters are built in sequence. When Chapter 3 or 4 needs your data, we ask for exactly that and pause your deadline until it arrives.",
    aside: "Deadline pauses",
  },
  {
    index: "04",
    title: "Quality review",
    body: "Every deliverable is checked against a fixed rubric — structure, citations, referencing style, formatting and page requirements.",
    aside: "19-point check",
  },
  {
    index: "05",
    title: "Delivery",
    body: "Settle the balance and download your work. Supervisor corrections within the original scope are handled at no extra cost.",
    aside: "Corrections included",
  },
];

/**
 * The five stages as a rail that fills as you descend — a sequence, which is
 * exactly what a row of cards cannot say. One IntersectionObserver, no scroll
 * handler. Body copy never dims below its readable value; only the marker and
 * the title change state.
 */
export function ProcessStages() {
  const [active, setActive] = React.useState(0);
  const refs = React.useRef<(HTMLLIElement | null)[]>([]);

  React.useEffect(() => {
    const nodes = refs.current.filter(Boolean) as HTMLLIElement[];
    if (!nodes.length || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const i = Number((entry.target as HTMLElement).dataset.stage);
          // Only ever advance — the rail reads as progress, not a yo-yo
          setActive((prev) => (i > prev ? i : prev));
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );

    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, []);

  return (
    <ol className="relative mt-14 md:mt-4">
      {/* The rail: dormant hairline with a teal segment that fills as you read */}
      <span
        aria-hidden
        className="absolute bottom-0 left-[7px] top-2 w-px bg-hairline/[0.14] md:left-[9px]"
      />
      <span
        aria-hidden
        style={{ transform: `scaleY(${(active + 1) / STAGES.length})` }}
        className="absolute bottom-0 left-[7px] top-2 w-px origin-top bg-gradient-to-b from-primary to-primary/30 transition-transform duration-700 ease-editorial md:left-[9px]"
      />

      {STAGES.map((stage, i) => {
        const reached = i <= active;
        return (
          <li
            key={stage.index}
            data-stage={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 pb-12 last:pb-0 md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-x-10 md:pb-16"
          >
            {/* Node */}
            <span
              aria-hidden
              className={cn(
                "relative z-10 mt-1.5 h-[15px] w-[15px] shrink-0 rounded-full transition-colors duration-500 ease-editorial md:h-[19px] md:w-[19px]",
                reached ? "bg-primary" : "bg-elevated"
              )}
            >
              <span
                className={cn(
                  "absolute inset-[4px] rounded-full transition-colors duration-500 md:inset-[5px]",
                  reached ? "bg-background" : "bg-background/60"
                )}
              />
            </span>

            <div className="min-w-0 pt-0.5">
              <span
                className={cn(
                  "index-mark transition-colors duration-500",
                  reached ? "text-primary" : "text-subtle"
                )}
              >
                {stage.index}
              </span>

              <h3 className="mt-2.5 text-[clamp(1.375rem,2.6vw,2rem)] font-medium leading-[1.12] tracking-[-0.028em] text-foreground">
                {stage.title}
              </h3>

              <p className="mt-3 max-w-measure-lg text-[15px] leading-[1.65] text-muted-foreground">
                {stage.body}
              </p>

              {/* On mobile the aside sits under the copy rather than vanishing */}
              <span className="mt-3 inline-block font-mono text-[10.5px] uppercase tracking-[0.16em] text-subtle md:hidden">
                {stage.aside}
              </span>
            </div>

            {/* Metadata hangs in the right margin on desktop */}
            <span className="hidden self-start pt-9 text-right font-mono text-[10.5px] uppercase tracking-[0.16em] text-subtle md:block">
              {stage.aside}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
