import { ACTIVITY_LABELS, type ActivityStatus } from "@/lib/ambassadors/tier-utils";
import { ACTIVITY_BADGE } from "@/lib/ambassadors/format";
import { cn } from "@/lib/utils";

/** Active / Dormant / Inactive / New — derived from conversion dates, never stored. */
export function ActivityBadge({ status, className }: { status: ActivityStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", ACTIVITY_BADGE[status], className)}>
      {ACTIVITY_LABELS[status]}
    </span>
  );
}
