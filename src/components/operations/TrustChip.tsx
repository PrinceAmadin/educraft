import { TRUST_TIER, type TrustTier } from "@/lib/operations/trust-tier";
import { cn } from "@/lib/utils";

/** A worker's Green / Amber / Red trust tier. The reason (or the tier's meaning) is the tooltip. */
export function TrustChip({ tier, reason, className }: { tier: TrustTier; reason?: string; className?: string }) {
  const t = TRUST_TIER[tier];
  return (
    <span
      title={reason ?? t.description}
      className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", t.tone, className)}
    >
      {t.label}
    </span>
  );
}
