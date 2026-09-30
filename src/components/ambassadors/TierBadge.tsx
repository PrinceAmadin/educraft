import type { AmbassadorTier } from "@prisma/client";
import { TIER_BADGE } from "@/lib/ambassador";
import { TIER_LABELS } from "@/lib/finance/cashflow-types";
import { cn } from "@/lib/utils";

export function TierBadge({ tier, className }: { tier: AmbassadorTier; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        TIER_BADGE[tier],
        className
      )}
    >
      {TIER_LABELS[tier] ?? tier}
    </span>
  );
}
