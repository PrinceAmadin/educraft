"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ScrollingPage } from "@/components/marketing/scene/DocumentBody";
import { IconArrowLeft, IconArrowRight, IconCheck } from "@/lib/icons";
import { CHAPTERS } from "@/lib/document-content";
import { ANNOTATIONS } from "@/lib/marketing";
import { cn } from "@/lib/utils";

const AUTO_MS = 5000;

/**
 * The manuscript, chapter by chapter.
 *
 * A single static page said "we check work". Walking all five chapters says
 * what is actually checked, and in what order — the review is a pass over a
 * whole report, not a spot inspection.
 *
 * The sheet is a fixed frame and the page inside it travels with the reader's
 * scroll, the same mechanism as the hero, so the document reads as live work.
 * Chapters cross-fade with `AnimatePresence mode="wait"` so the outgoing page
 * is gone before the next arrives — two manuscripts on screen at once would
 * read as a glitch.
 *
 * Auto-advances every 5s, pauses on hover or focus, and stops permanently once
 * the reader takes control. Reduced motion disables rotation and the page
 * travel, leaving a fully manual, fully legible slider.
 */
export function ChapterSlider({
  onChange,
}: {
  /** Fires whenever the visible chapter changes, so a parent can re-cue
      anything pinned to the document — the margin annotations, here. */
  onChange?: (index: number) => void;
}) {
  const [index, setIndex] = React.useState(2); // open on Ch.3, the methodology
  const [direction, setDirection] = React.useState(1);
  const [held, setHeld] = React.useState(false);
  const [committed, setCommitted] = React.useState(false);
  const reduced = useReducedMotion();

  const paused = held || committed || Boolean(reduced);
  const chapter = CHAPTERS[index];

  React.useEffect(() => {
    onChange?.(index);
  }, [index, onChange]);

  React.useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setDirection(1);
      setIndex((i) => (i + 1) % CHAPTERS.length);
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [paused]);

  const go = (delta: number) => {
    setDirection(delta);
    setCommitted(true);
    setIndex((i) => (i + delta + CHAPTERS.length) % CHAPTERS.length);
  };

  const jump = (i: number) => {
    setDirection(i > index ? 1 : -1);
    setCommitted(true);
    setIndex(i);
  };

  return (
    <div
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
      className="relative mx-auto w-full max-w-[420px]"
    >
      {/* Live region so the chapter change is announced, not just seen */}
      <p aria-live="polite" className="sr-only">
        {chapter.label}: {chapter.title}
      </p>

      <div
        className={cn(
          "paper-surface relative aspect-[1/1.36] w-full overflow-hidden",
          "[clip-path:polygon(0_0,100%_0,100%_calc(100%-30px),calc(100%-30px)_100%,0_100%)]"
        )}
      >
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={chapter.id}
            custom={direction}
            initial={reduced ? false : { opacity: 0, x: direction * 26 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduced ? undefined : { opacity: 0, x: direction * -26 }}
            transition={{ type: "spring", stiffness: 300, damping: 34, mass: 0.8 }}
            className="flex h-full flex-col p-[9%]"
          >
            <div className="flex shrink-0 items-start justify-between">
              <p className="font-mono text-[0.5625rem] font-semibold tracking-[0.16em] text-primary">
                EDUCRAFT / QUALITY REVIEW
              </p>
              <p className="font-mono text-[0.5625rem] font-medium tracking-[0.16em] text-paper-muted">
                REV. 02
              </p>
            </div>

            <p className="mt-[7%] shrink-0 font-display text-[1.4rem] font-semibold leading-none tracking-tight text-paper-ink">
              {chapter.label}
            </p>
            <p className="mt-2 shrink-0 text-[0.95rem] leading-none text-paper-muted">
              {chapter.title}
            </p>

            <div className="mt-[6%] h-px shrink-0 bg-paper-ink/15" />

            {/* The page body — travels with the reader's scroll */}
            <div className="relative mt-[6%] min-h-0 flex-1">
              <span
                aria-hidden
                className="absolute -left-[5%] top-1 z-10 h-12 w-[2px] bg-primary"
              />
              <ScrollingPage
                blocks={chapter.blocks}
                distance={38}
                fontSize="0.5rem"
              />
            </div>

            <span
              aria-hidden
              className="absolute right-0 top-[38%] h-[13%] w-[10px] bg-gold"
            />

            <span className="absolute bottom-[7%] left-[9%] font-mono text-[0.5625rem] font-medium text-paper-muted">
              {chapter.folio}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Review stamp — lands after the annotations have settled */}
      <motion.div
        key={`stamp-${chapter.id}`}
        initial={reduced ? false : { opacity: 0, scale: 0.82 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          type: "spring",
          stiffness: 420,
          damping: 26,
          delay: reduced ? 0 : 0.28 + ANNOTATIONS.length * 0.09,
        }}
        className={cn(
          "absolute -bottom-5 -right-3 flex items-center gap-2 bg-primary px-4 py-2.5 text-primary-foreground",
          "[clip-path:polygon(0_0,100%_0,100%_calc(100%-9px),calc(100%-9px)_100%,0_100%)]"
        )}
      >
        <IconCheck aria-hidden className="size-3.5" />
        <span className="font-mono text-[0.625rem] font-semibold tracking-[0.16em]">
          PASSED
        </span>
      </motion.div>

      {/* ── Controls ─────────────────────────────────────── */}
      <div className="mt-10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <SliderButton label="Previous chapter" onClick={() => go(-1)}>
            <IconArrowLeft aria-hidden className="size-4" />
          </SliderButton>
          <SliderButton label="Next chapter" onClick={() => go(1)}>
            <IconArrowRight aria-hidden className="size-4" />
          </SliderButton>
        </div>

        {/* Chapter index — each segment is a target, and fills while active */}
        <div className="flex flex-1 items-center gap-1.5">
          {CHAPTERS.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => jump(i)}
              aria-label={`${c.label}: ${c.title}`}
              aria-current={i === index ? "true" : undefined}
              className="group/seg relative h-6 flex-1 outline-none"
            >
              <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-hairline/20 transition-colors duration-fast group-hover/seg:bg-hairline/40" />
              {i === index && (
                <motion.span
                  key={`fill-${index}-${paused}`}
                  className="absolute inset-x-0 top-1/2 h-px origin-left -translate-y-1/2 bg-primary"
                  initial={{ scaleX: paused ? 1 : 0 }}
                  animate={{ scaleX: 1 }}
                  transition={
                    paused ? { duration: 0 } : { duration: AUTO_MS / 1000, ease: "linear" }
                  }
                />
              )}
            </button>
          ))}
        </div>

        <p className="tabular shrink-0 text-xs text-subtle">
          <span className="text-foreground">{String(index + 1).padStart(2, "0")}</span>
          <span className="mx-1">/</span>
          {String(CHAPTERS.length).padStart(2, "0")}
        </p>
      </div>
    </div>
  );
}

function SliderButton({
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
      className={cn(
        "flex size-9 items-center justify-center text-muted-foreground",
        "border border-hairline/20 transition-colors duration-fast",
        "hover:border-primary/50 hover:text-primary",
        "focus-visible:border-primary focus-visible:text-primary",
        "[clip-path:polygon(0_0,100%_0,100%_calc(100%-7px),calc(100%-7px)_100%,0_100%)]"
      )}
    >
      {children}
    </button>
  );
}
