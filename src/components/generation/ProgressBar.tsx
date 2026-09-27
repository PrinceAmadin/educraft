"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const TONES = {
  primary: "bg-primary",
  success: "bg-success",
  danger: "bg-danger",
  gold: "bg-gold",
} as const;

/**
 * A progress bar that screen readers can read (role="progressbar",
 * aria-valuenow 0–100). The width follows `value` with a short spring, or
 * jumps straight there when the reader prefers reduced motion.
 */
export function ProgressBar({ value, label, tone = "primary", className }: { value: number; label: string; tone?: keyof typeof TONES; className?: string }) {
  const reduce = useReducedMotion();
  const v = Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
  return (
    <div role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label} className={cn("h-2 w-full overflow-hidden rounded-full bg-foreground/10", className)}>
      <motion.div
        className={cn("h-full rounded-full", TONES[tone])}
        initial={false}
        animate={{ width: `${v}%` }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 140, damping: 24 }}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}
