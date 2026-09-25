import type { AmbassadorTier } from "@prisma/client";
import { AMBASSADOR_TIERS, rateForTier } from "@/lib/finance/commission-config";

/**
 * Tier rules for the Ambassador Platform. Pure: the thresholds come from
 * `AMBASSADOR_TIERS` in the finance config (the one source of truth), never
 * from numbers typed here. The tier is always derived from the lifetime
 * conversion count — nothing sets it by hand.
 */

const LADDER = [...AMBASSADOR_TIERS].sort((a, b) => a.minConversions - b.minConversions);

/** The tier a lifetime conversion count earns. */
export function calculateTier(lifetimeConversions: number): AmbassadorTier {
  const n = Math.max(0, Math.floor(lifetimeConversions));
  let tier: AmbassadorTier = LADDER[0].name;
  for (const step of LADDER) if (n >= step.minConversions) tier = step.name;
  return tier;
}

/** The next tier up, or null at Platinum. */
export function nextTier(tier: AmbassadorTier): AmbassadorTier | null {
  const idx = LADDER.findIndex((t) => t.name === tier);
  return idx >= 0 && idx < LADDER.length - 1 ? LADDER[idx + 1].name : null;
}

/** Conversions still needed for the next tier; null at Platinum. */
export function conversionsTillNextTier(lifetimeConversions: number): number | null {
  const current = calculateTier(lifetimeConversions);
  const next = nextTier(current);
  if (!next) return null;
  const min = LADDER.find((t) => t.name === next)!.minConversions;
  return Math.max(0, min - Math.max(0, Math.floor(lifetimeConversions)));
}

/** A Core may activate a sub-team from Silver up. */
export function isEligibleForSubTeam(tier: AmbassadorTier): boolean {
  return tier !== "BRONZE";
}

/** "Silver (6 conversions)": the first tier that may lead a sub-team, from the config. */
export function subTeamThresholdLabel(): string {
  const first = LADDER.find((t) => isEligibleForSubTeam(t.name))!;
  return `${first.label} (${first.minConversions} conversions)`;
}

/** 0.15 → "15%", 0.025 → "2.5%". */
export function percentLabel(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

/** Commission fraction for a tier (BRONZE → 0.10). */
export function tierRate(tier: AmbassadorTier): number {
  return rateForTier(tier);
}

/** 0–100 progress through the current tier band (100 at Platinum). */
export function tierProgressPercent(lifetimeConversions: number): number {
  const current = calculateTier(lifetimeConversions);
  const next = nextTier(current);
  if (!next) return 100;
  const start = LADDER.find((t) => t.name === current)!.minConversions;
  const end = LADDER.find((t) => t.name === next)!.minConversions;
  const n = Math.max(0, Math.floor(lifetimeConversions));
  return Math.max(0, Math.min(100, Math.round(((n - start) / Math.max(1, end - start)) * 100)));
}

export function tierLabel(tier: AmbassadorTier): string {
  return LADDER.find((t) => t.name === tier)?.label ?? tier;
}

// ── Activity, derived from dates (never a stored status) ────────────────

export type ActivityStatus = "ACTIVE" | "DORMANT" | "INACTIVE" | "NEW";

export const ACTIVITY_LABELS: Record<ActivityStatus, string> = {
  ACTIVE: "Active",
  DORMANT: "Dormant",
  INACTIVE: "Inactive",
  NEW: "New",
};

const DAY = 86_400_000;

/**
 * Active: a CONVERSION (a referred client's downpayment confirmed) in the
 * last 30 days — a referral that has not paid does not count (the spec's
 * testing checklist). Dormant: the last conversion was 30–60 days ago.
 * Inactive: 60+ days (or never, for someone who joined over 30 days ago).
 * New: joined within 30 days with no conversion yet. Computed from the
 * dates at read time, so it is always current and never has to be swept.
 */
export function activityStatus(input: { lastConversionAt: Date | null; createdAt: Date; lifetimeConversions: number }, now: Date = new Date()): ActivityStatus {
  const last = input.lastConversionAt;
  if (!last) {
    return now.getTime() - input.createdAt.getTime() <= 30 * DAY && input.lifetimeConversions === 0 ? "NEW" : "INACTIVE";
  }
  const age = now.getTime() - last.getTime();
  if (age <= 30 * DAY) return "ACTIVE";
  if (age <= 60 * DAY) return "DORMANT";
  return "INACTIVE";
}

// ── Referral codes ──────────────────────────────────────────────────────

/**
 * BLE-LAG-847: the first three letters of the name, a three-letter school
 * code (the university abbreviation without a leading UNI, so UNILAG → LAG,
 * UNIBEN → BEN, UNN → UNN) and three random digits. The caller retries on
 * a collision.
 */
export function buildReferralCode(fullName: string, schoolAbbreviation: string, random: () => number = Math.random): string {
  const name = (fullName.replace(/[^a-zA-Z]/g, "").slice(0, 3) || "AMB").toUpperCase();
  const stripped = schoolAbbreviation.replace(/[^a-zA-Z]/g, "").toUpperCase();
  const withoutUni = stripped.length > 3 && stripped.startsWith("UNI") ? stripped.slice(3) : stripped;
  const school = (withoutUni.slice(0, 3) || stripped.slice(0, 3) || "EDU").padEnd(3, "X");
  const digits = String(Math.floor(random() * 1000)).padStart(3, "0");
  return `${name}-${school}-${digits}`;
}
