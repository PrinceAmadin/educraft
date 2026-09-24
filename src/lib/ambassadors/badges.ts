import type { AmbassadorTier } from "@prisma/client";
import { conversionsTillNextTier, nextTier, tierLabel, calculateTier } from "@/lib/ambassadors/tier-utils";

/**
 * Leaderboard badges (Phase 3 Section 5). Pure: the service gathers the
 * facts, this decides which badges show. Icons are Lucide (no emoji).
 *
 *   Challenge complete — the quarterly challenge target is met
 *   Tier up           — promoted to a higher tier this month
 *   On fire           — 3+ conversions in the last 7 days
 *   N away from Tier  — within 3 conversions of the next tier
 *   Back from dormant — first conversion this month after 30+ quiet days
 */

export type BadgeKind = "CHALLENGE_COMPLETE" | "TIER_UP" | "ON_FIRE" | "NEAR_TIER" | "BACK_FROM_DORMANT";

export interface Badge {
  kind: BadgeKind;
  label: string;
}

export interface BadgeInput {
  lifetimeConversions: number;
  conversionsLast7Days: number;
  challengeComplete: boolean;
  /** The tier they were promoted to this month, if any. */
  tierUpThisMonthTo: AmbassadorTier | null;
  backFromDormant: boolean;
}

export const ON_FIRE_THRESHOLD = 3;
export const NEAR_TIER_WITHIN = 3;
export const DORMANT_DAYS = 30;

export function badgesFor(input: BadgeInput): Badge[] {
  const out: Badge[] = [];
  if (input.challengeComplete) out.push({ kind: "CHALLENGE_COMPLETE", label: "Challenge complete" });
  if (input.tierUpThisMonthTo) out.push({ kind: "TIER_UP", label: `Tier up (just hit ${tierLabel(input.tierUpThisMonthTo)})` });
  if (input.conversionsLast7Days >= ON_FIRE_THRESHOLD) out.push({ kind: "ON_FIRE", label: "On fire" });
  const left = conversionsTillNextTier(input.lifetimeConversions);
  const next = nextTier(calculateTier(input.lifetimeConversions));
  if (left != null && next && left > 0 && left <= NEAR_TIER_WITHIN) out.push({ kind: "NEAR_TIER", label: `${left} away from ${tierLabel(next)}` });
  if (input.backFromDormant) out.push({ kind: "BACK_FROM_DORMANT", label: "First conversion this month" });
  return out;
}

/**
 * Back from dormant: their first conversion this month came 30+ days after
 * their previous one — or, with none before, 30+ days after they joined.
 */
export function isBackFromDormant(firstThisMonth: Date | null, previousBeforeMonth: Date | null, joinedAt: Date): boolean {
  if (!firstThisMonth) return false;
  const since = previousBeforeMonth ?? joinedAt;
  return firstThisMonth.getTime() - since.getTime() >= DORMANT_DAYS * 86_400_000;
}

const TIER_ORDER: AmbassadorTier[] = ["BRONZE", "SILVER", "GOLD", "PLATINUM"];

/** True when `to` is a higher tier than `from` (a promotion, not a demotion). */
export function isPromotion(from: AmbassadorTier, to: AmbassadorTier): boolean {
  return TIER_ORDER.indexOf(to) > TIER_ORDER.indexOf(from);
}
