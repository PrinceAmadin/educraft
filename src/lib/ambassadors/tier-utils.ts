import type { AmbassadorTier } from "@prisma/client";
import { TIER_KEYS, TIER_LABELS, type TierRule } from "@/lib/finance/cashflow-types";
import { rateForTier } from "@/lib/finance/commission-config";

/**
 * Tier rules for the Ambassador Platform. Pure: the thresholds and rates come
 * from the published cashflow structure's `tiers` (the one source of truth),
 * handed in by the caller — never from numbers typed here. The tier is
 * derived from the lifetime conversion count; nothing sets it by hand,
 * except that an executive's ambassador record (CEO, CFO, HOG, COO; see
 * `executive-identity.ts`) is always the top tier (founder, 27 Sept 2026).
 * `recountAmbassador` stores the result, so everything else reads the stored
 * tier.
 */

export type TierLadder = readonly TierRule[];

/** The top tier (Platinum). Fixed: the four tier names never change. */
export const TOP_TIER: AmbassadorTier = "PLATINUM";

function ladder(tiers: TierLadder): TierRule[] {
  return [...tiers].sort((a, b) => a.minConversions - b.minConversions);
}

/** Conversions the top tier takes when earned by count (31 in v1). */
export function topTierMinConversions(tiers: TierLadder): number {
  return tiers.find((t) => t.key === TOP_TIER)?.minConversions ?? ladder(tiers).at(-1)?.minConversions ?? 0;
}

/** The tier a lifetime conversion count earns. */
export function calculateTier(lifetimeConversions: number, tiers: TierLadder): AmbassadorTier {
  const n = Math.max(0, Math.floor(lifetimeConversions));
  let tier: AmbassadorTier = "BRONZE";
  for (const step of ladder(tiers)) if (n >= step.minConversions) tier = step.key;
  return tier;
}

/** The tier an ambassador holds: an executive is always the top tier, everyone else by count. */
export function ambassadorTier(lifetimeConversions: number, executive: boolean, tiers: TierLadder): AmbassadorTier {
  return executive ? TOP_TIER : calculateTier(lifetimeConversions, tiers);
}

/** The next tier up, or null at Platinum. The order is fixed by name. */
export function nextTier(tier: AmbassadorTier): AmbassadorTier | null {
  const idx = TIER_KEYS.indexOf(tier);
  return idx >= 0 && idx < TIER_KEYS.length - 1 ? TIER_KEYS[idx + 1] : null;
}

function minOf(tier: AmbassadorTier, tiers: TierLadder): number {
  return tiers.find((t) => t.key === tier)?.minConversions ?? 0;
}

/** Conversions still needed for the next tier; null at Platinum. */
export function conversionsTillNextTier(lifetimeConversions: number, tiers: TierLadder): number | null {
  const current = calculateTier(lifetimeConversions, tiers);
  const next = nextTier(current);
  if (!next) return null;
  return Math.max(0, minOf(next, tiers) - Math.max(0, Math.floor(lifetimeConversions)));
}

/**
 * Conversions to the next tier from the STORED tier: null at Platinum, so an
 * executive (Platinum on few conversions) is never "2 away from Silver".
 */
export function toNextTier(tier: AmbassadorTier, lifetimeConversions: number, tiers: TierLadder): number | null {
  return nextTier(tier) ? conversionsTillNextTier(lifetimeConversions, tiers) : null;
}

/** 0–100 progress from the STORED tier: 100 at Platinum. */
export function tierProgressFor(tier: AmbassadorTier, lifetimeConversions: number, tiers: TierLadder): number {
  return nextTier(tier) ? tierProgressPercent(lifetimeConversions, tiers) : 100;
}

/** Platinum without the conversions for it: an executive, Platinum by office. */
export function platinumByOffice(tier: AmbassadorTier, lifetimeConversions: number, tiers: TierLadder): boolean {
  return tier === TOP_TIER && calculateTier(lifetimeConversions, tiers) !== TOP_TIER;
}

/**
 * How many of a Platinum ambassador's clients this quarter count toward the
 * Platinum quarterly bonus. Platinum by count: every client converted in the
 * quarter. An executive (Platinum by office): only the clients who paid on or
 * after they became Platinum — nothing retroactive (founder, 27 Sept 2026) —
 * and none when there is no promotion on record.
 */
export function platinumBonusClientCount(convertedAt: readonly Date[], opts: { byOffice: boolean; promotedAt: Date | null }): number {
  if (!opts.byOffice) return convertedAt.length;
  const from = opts.promotedAt;
  if (!from) return 0;
  return convertedAt.filter((d) => d.getTime() >= from.getTime()).length;
}

/** A Core may activate a sub-team from Silver up. */
export function isEligibleForSubTeam(tier: AmbassadorTier): boolean {
  return tier !== "BRONZE";
}

/** "Silver (6 conversions)": the first tier that may lead a sub-team, from the ladder. */
export function subTeamThresholdLabel(tiers: TierLadder): string {
  const first = TIER_KEYS.find((t) => isEligibleForSubTeam(t)) ?? "SILVER";
  return `${TIER_LABELS[first]} (${minOf(first, tiers)} conversions)`;
}

/** 0.15 → "15%", 0.025 → "2.5%". */
export function percentLabel(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

/** Commission fraction for a tier (BRONZE → 0.10). */
export function tierRate(tier: AmbassadorTier, tiers: TierLadder): number {
  return rateForTier(tier, tiers);
}

/** 0–100 progress through the current tier band (100 at Platinum). */
export function tierProgressPercent(lifetimeConversions: number, tiers: TierLadder): number {
  const current = calculateTier(lifetimeConversions, tiers);
  const next = nextTier(current);
  if (!next) return 100;
  const start = minOf(current, tiers);
  const end = minOf(next, tiers);
  const n = Math.max(0, Math.floor(lifetimeConversions));
  return Math.max(0, Math.min(100, Math.round(((n - start) / Math.max(1, end - start)) * 100)));
}

export function tierLabel(tier: AmbassadorTier): string {
  return TIER_LABELS[tier] ?? tier;
}

export interface TierProgress {
  current: AmbassadorTier;
  currentLabel: string;
  next: AmbassadorTier | null;
  nextLabel: string | null;
  /** Referred clients who have paid a downpayment on at least one order. */
  payingClients: number;
  /** Paying clients still needed to reach `next`; 0 when already at the top. */
  toNext: number;
  /** 0–100 progress through the current tier band. */
  percent: number;
  /** True when the paying-client count already earns a higher tier than stored. */
  eligibleForPromotion: boolean;
}

/** The portal's view of where an ambassador stands on the ladder, from their STORED tier. */
export function tierProgress(stored: AmbassadorTier, payingClients: number, tiers: TierLadder): TierProgress {
  const next = nextTier(stored);
  const earned = calculateTier(payingClients, tiers);
  const percent = next == null ? 100 : Math.min(100, Math.max(0, Math.round(((payingClients - minOf(stored, tiers)) / Math.max(1, minOf(next, tiers) - minOf(stored, tiers))) * 100)));
  return {
    current: stored,
    currentLabel: TIER_LABELS[stored],
    next,
    nextLabel: next ? TIER_LABELS[next] : null,
    payingClients,
    toNext: next ? Math.max(0, minOf(next, tiers) - payingClients) : 0,
    percent,
    eligibleForPromotion: TIER_KEYS.indexOf(earned) > TIER_KEYS.indexOf(stored),
  };
}

/** The ladder as the portals show it: name, threshold and rate per tier, in order. */
export function tierLadderRows(tiers: TierLadder): { tier: AmbassadorTier; label: string; minPayingClients: number; rate: number }[] {
  return TIER_KEYS.map((key) => ({ tier: key, label: TIER_LABELS[key], minPayingClients: minOf(key, tiers), rate: Math.round(rateForTier(key, tiers) * 100) }));
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
 * Inactive: 60+ days. Someone who has never converted is timed from the day
 * they joined: New for their first 30 days, then Dormant, then Inactive
 * after 60 — so "Inactive" always means 60+ days without a conversion.
 * Computed from the dates at read time, so it is always current and never
 * has to be swept.
 */
export function activityStatus(input: { lastConversionAt: Date | null; createdAt: Date; lifetimeConversions: number }, now: Date = new Date()): ActivityStatus {
  const last = input.lastConversionAt;
  if (!last) {
    const sinceJoined = now.getTime() - input.createdAt.getTime();
    if (sinceJoined <= 30 * DAY) return input.lifetimeConversions === 0 ? "NEW" : "DORMANT";
    return sinceJoined <= 60 * DAY ? "DORMANT" : "INACTIVE";
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
