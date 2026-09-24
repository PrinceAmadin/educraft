import { LuFlame, LuSparkles, LuSunrise, LuTrophy, LuZap } from "react-icons/lu";
import type { Badge, BadgeKind } from "@/lib/ambassadors/badges";
import { cn } from "@/lib/utils";

const STYLE: Record<BadgeKind, { icon: typeof LuTrophy; className: string }> = {
  CHALLENGE_COMPLETE: { icon: LuTrophy, className: "bg-gold/15 text-gold" },
  TIER_UP: { icon: LuSparkles, className: "bg-primary/15 text-primary" },
  ON_FIRE: { icon: LuFlame, className: "bg-danger/10 text-danger" },
  NEAR_TIER: { icon: LuZap, className: "bg-info/15 text-info" },
  BACK_FROM_DORMANT: { icon: LuSunrise, className: "bg-success/15 text-success" },
};

/** The leaderboard's badges as small Lucide chips (no emoji anywhere). */
export function LeaderboardBadges({ badges, className }: { badges: Badge[]; className?: string }) {
  if (badges.length === 0) return null;
  return (
    <span className={cn("flex flex-wrap gap-1.5", className)}>
      {badges.map((b) => {
        const s = STYLE[b.kind];
        const Icon = s.icon;
        return (
          <span key={b.kind} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", s.className)} title={b.kind === "BACK_FROM_DORMANT" ? "First conversion this month after being dormant" : undefined}>
            <Icon className="size-3" aria-hidden />
            {b.label}
          </span>
        );
      })}
    </span>
  );
}
