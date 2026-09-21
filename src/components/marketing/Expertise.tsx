"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { DisplayHeading, Eyebrow, Section } from "@/components/primitives/Section";
import { Reveal } from "@/components/primitives/Reveal";
import { DISCIPLINES } from "@/lib/marketing";
import { cn } from "@/lib/utils";

const CYCLE_MS = 3500;

/**
 * Human expertise.
 *
 * Previously eight full-height rows — a directory that ate a screen and a half
 * to say one thing. Now the eight disciplines are a compact index and the
 * detail is a stage: one field is shown at display scale, and the index cycles
 * through them.
 *
 * Behaviour:
 *   • Auto-advances every 3.5s so the section is alive at rest.
 *   • Pauses while hovered or focused (WCAG 2.2.2), and stops for good once
 *     the reader picks an entry — a rotation that fights the user is worse
 *     than no rotation.
 *   • Reduced motion disables the rotation entirely and the index becomes a
 *     plain, fully manual control.
 *
 * Wired as a real tablist: arrow keys move between disciplines, and the stage
 * is the tabpanel each tab controls.
 */
export function Expertise() {
  const [active, setActive] = React.useState(0);
  const [held, setHeld] = React.useState(false);
  const [committed, setCommitted] = React.useState(false);
  const reduced = useReducedMotion();
  const tabRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const paused = held || committed || Boolean(reduced);

  React.useEffect(() => {
    if (paused) return;
    const id = window.setInterval(
      () => setActive((i) => (i + 1) % DISCIPLINES.length),
      CYCLE_MS
    );
    return () => window.clearInterval(id);
  }, [paused]);

  const select = (i: number) => {
    setActive(i);
    setCommitted(true);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const last = DISCIPLINES.length - 1;
    let next: number | null = null;

    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = active === last ? 0 : active + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = active === 0 ? last : active - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;

    if (next === null) return;
    event.preventDefault();
    select(next);
    tabRefs.current[next]?.focus();
  };

  const current = DISCIPLINES[active];

  return (
    <Section ground="a" rhythm="normal">
      <div className="shell">
        <div className="grid-12">
          <Reveal className="col-span-4 md:col-span-5">
            <Eyebrow index="03">Who does the work</Eyebrow>
            <DisplayHeading
              className="mt-7"
              scale="display-sm"
              lines={["Specialists,", "not generalists."]}
            />
          </Reveal>

          <Reveal
            delay={110}
            className="col-span-4 mt-8 self-end md:col-span-4 md:col-start-9 md:mt-0"
          >
            <p className="max-w-measure text-[0.9375rem] leading-relaxed text-muted-foreground">
              A project is assigned to someone who has studied the field, knows
              what a supervisor in that department expects, and can defend the
              methodology if asked.
            </p>
            <p className="mt-6 index-mark text-subtle">
              {String(DISCIPLINES.length).padStart(2, "0")} DISCIPLINES COVERED
            </p>
          </Reveal>
        </div>

        <Reveal delay={80}>
          <div
            className="mt-14 grid-12 md:mt-20"
            onMouseEnter={() => setHeld(true)}
            onMouseLeave={() => setHeld(false)}
            onFocusCapture={() => setHeld(true)}
            onBlurCapture={() => setHeld(false)}
          >
            {/* ── Index: eight names in two compact columns ── */}
            <div
              role="tablist"
              aria-label="Disciplines"
              aria-orientation="vertical"
              onKeyDown={onKeyDown}
              className="col-span-4 grid grid-cols-2 gap-x-8 self-start md:col-span-5"
            >
              {DISCIPLINES.map((d, i) => {
                const selected = i === active;
                return (
                  <button
                    key={d.name}
                    ref={(el) => {
                      tabRefs.current[i] = el;
                    }}
                    role="tab"
                    id={`discipline-tab-${i}`}
                    aria-selected={selected}
                    aria-controls="discipline-panel"
                    tabIndex={selected ? 0 : -1}
                    onClick={() => select(i)}
                    className="group/entry relative flex items-baseline gap-3 border-t border-hairline/12 py-3.5 text-left outline-none"
                  >
                    {/* Selection marker: a teal rule in the margin, not a chip */}
                    <span
                      aria-hidden
                      className={cn(
                        "absolute left-0 top-0 h-px w-full origin-left bg-primary transition-transform duration-normal ease-editorial",
                        selected ? "scale-x-100" : "scale-x-0"
                      )}
                    />
                    <span
                      className={cn(
                        "index-mark shrink-0 transition-colors duration-fast",
                        selected ? "text-primary" : "text-subtle"
                      )}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={cn(
                        "text-[0.9375rem] leading-snug tracking-[-0.01em] transition-colors duration-fast md:text-base",
                        selected
                          ? "text-foreground"
                          : "text-muted-foreground group-hover/entry:text-foreground"
                      )}
                    >
                      {d.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* ── Stage: the selected field, at scale ── */}
            <div
              role="tabpanel"
              id="discipline-panel"
              aria-labelledby={`discipline-tab-${active}`}
              className="surface relative col-span-4 mt-10 overflow-hidden rounded-2xl p-6 sm:p-8 md:col-span-6 md:col-start-7 md:mt-0 md:p-10"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-[radial-gradient(closest-side,hsl(var(--primary)/0.14),transparent)]"
              />
              <AnimatePresence mode="wait">
                <motion.div
                  key={current.name}
                  initial={reduced ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduced ? undefined : { opacity: 0, y: -10 }}
                  transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.7 }}
                >
                  <h3 className="font-display text-[clamp(2rem,4.6vw,3.75rem)] font-medium leading-[0.98] tracking-[-0.04em] text-foreground">
                    {current.name}
                  </h3>

                  <ul className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2">
                    {current.fields.split(" · ").map((field) => (
                      <li key={field} className="flex items-center gap-3">
                        <span
                          aria-hidden
                          className="h-1 w-1 shrink-0 rounded-full bg-primary/70"
                        />
                        <span className="text-[0.9375rem] text-muted-foreground">
                          {field}
                        </span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              </AnimatePresence>

              {/* Rotation progress — the only moving indicator in the section */}
              <div aria-hidden className="mt-10 h-px w-full bg-hairline/12">
                <motion.div
                  key={`${active}-${paused}`}
                  className="h-px bg-primary"
                  initial={{ width: paused ? "100%" : "0%" }}
                  animate={{ width: "100%" }}
                  transition={
                    paused ? { duration: 0 } : { duration: CYCLE_MS / 1000, ease: "linear" }
                  }
                />
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
