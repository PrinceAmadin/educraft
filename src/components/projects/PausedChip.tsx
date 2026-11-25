import { LuPause } from "react-icons/lu";
import { cn } from "@/lib/utils";
import type { ClockPause } from "@/lib/pause-clock";

/**
 * A paused project, said once and the same way everywhere staff look: the
 * pipeline, the projects list, a project's own page. Blue, because a stopped
 * clock is a wait — not something going wrong.
 */
export function PausedChip({ pause, className }: { pause: ClockPause | null; className?: string }) {
  if (!pause) return null;
  return (
    <span
      title={`${pause.detail}. The delivery date moves on by the days paused.`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full bg-info/10 px-2 py-px text-[11px] font-medium text-info",
        className
      )}
    >
      <LuPause className="size-3" aria-hidden />
      {pause.label}
    </span>
  );
}
