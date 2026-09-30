"use client";

import { motion, useReducedMotion } from "framer-motion";
import { scoreBand } from "@/lib/generation/objectives-check-rules";
import { cn } from "@/lib/utils";

const RADIUS = 42;

/**
 * One circular loaded ring of the independent check: the score as a teal arc
 * on a faint track, the percentage in the middle, the label and its band word
 * (Strong / Fair / Weak) underneath. Always teal (founder, 30 Sept 2026): the
 * band word carries the judgement. The arc fills with a short spring, or
 * appears at once when the reader prefers reduced motion.
 */
export function ScoreRing({ label, value, dimmed = false }: { label: string; value: number; dimmed?: boolean }) {
  const reduce = useReducedMotion();
  const v = Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
  const band = scoreBand(v);
  return (
    <figure role="img" aria-label={`${label}: ${v} percent, ${band}`} className={cn("flex flex-col items-center gap-1.5 transition-opacity", dimmed && "opacity-50")}>
      <div className="relative size-[76px] sm:size-24">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="9" className="stroke-foreground/10" />
          <motion.circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="9"
            strokeLinecap="round"
            className="stroke-primary"
            initial={{ pathLength: reduce ? v / 100 : 0 }}
            animate={{ pathLength: v / 100 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 70, damping: 18 }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-lg font-medium tabular-nums text-foreground sm:text-xl">
          {v}%
        </span>
      </div>
      <figcaption className="text-center leading-tight">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{band}</span>
      </figcaption>
    </figure>
  );
}
