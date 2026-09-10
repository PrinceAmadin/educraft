import type { AmbassadorTier } from "@prisma/client";
import { TIER_BADGE, TIER_LADDER } from "@/lib/ambassador";
import { cn } from "@/lib/utils";

export function TierBadge({ tier, className }: { tier: AmbassadorTier; className?: string }) {
  const label = TIER_LADDER.find((t) => t.tier === tier)?.label ?? tier;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        TIER_BADGE[tier],
        className
      )}
    >
      {label}
    </span>
  );
}
