import { cn } from "@/lib/utils";
import type { StatusAge } from "@/lib/operations/pipeline-stages";

const TONE: Record<StatusAge["tone"], string> = {
  normal: "text-muted-foreground",
  amber: "text-gold font-medium",
  red: "text-danger font-semibold",
};

/** "3d" — how long the project has sat in its status; amber past 1.5× the expected time, red past 2×. */
export function DaysInStatus({ age, className }: { age: StatusAge; className?: string }) {
  const expected = age.expectedHours != null ? `expected within ${age.expectedHours >= 48 ? `${Math.round(age.expectedHours / 24)} days` : `${age.expectedHours} hours`}` : "no fixed expectation";
  return (
    <span className={cn("font-mono text-sm tabular-nums", TONE[age.tone], className)} title={`${Math.round(age.hours)} hours in this status · ${expected}`}>
      {age.label}
    </span>
  );
}
