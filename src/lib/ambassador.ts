import type { AmbassadorTier } from "@prisma/client";
import { TIER_COMMISSION_RATE } from "@/lib/constants";

/**
 * Ambassador tier ladder. Thresholds are conversion counts — a "conversion"
 * being a referred client who has placed at least one project.
 */
export const TIER_LADDER: {
  tier: AmbassadorTier;
  label: string;
  minConversions: number;
  rate: number;
}[] = [
  { tier: "BRONZE", label: "Bronze", minConversions: 0, rate: TIER_COMMISSION_RATE.BRONZE },
  { tier: "SILVER", label: "Silver", minConversions: 6, rate: TIER_COMMISSION_RATE.SILVER },
  { tier: "GOLD", label: "Gold", minConversions: 16, rate: TIER_COMMISSION_RATE.GOLD },
  { tier: "PLATINUM", label: "Platinum", minConversions: 31, rate: TIER_COMMISSION_RATE.PLATINUM },
];

/**
 * How long a newly approved ambassador holds their slot before they have to
 * show something for it. One confirmed order inside the window and the slot is
 * theirs for good; none, and the sweep releases it for the next applicant.
 */
export const PROVISIONAL_DAYS = 30;

/** Days before the deadline that the one reminder email goes out. */
export const PROVISIONAL_WARN_DAYS = 9;

export function provisionalDeadline(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + PROVISIONAL_DAYS);
  return d;
}

/**
 * Provisional is a date, not a status: several queries match
 * `status: "Active"` exactly, so a status value would quietly drop these
 * ambassadors out of the weekly email and the like.
 */
export function isProvisional(a: { provisionalUntil: Date | null; activatedAt: Date | null }): boolean {
  return a.provisionalUntil !== null && a.activatedAt === null;
}

/** Whole days left on the window — 0 once it has run out. */
export function provisionalDaysLeft(until: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((until.getTime() - now.getTime()) / 86_400_000));
}

export const TIER_BADGE: Record<AmbassadorTier, string> = {
  BRONZE: "border-transparent bg-amber-700/15 text-amber-700 dark:text-amber-500",
  SILVER: "border-transparent bg-slate-400/15 text-slate-500 dark:text-slate-300",
  GOLD: "border-transparent bg-gold/15 text-gold",
  PLATINUM: "border-transparent bg-primary/15 text-primary",
};

export interface TierProgress {
  current: AmbassadorTier;
  currentLabel: string;
  next: AmbassadorTier | null;
  nextLabel: string | null;
  conversions: number;
  /** Conversions needed to reach `next`; 0 when already at the top. */
  toNext: number;
  /** 0–100 progress through the current tier band. */
  percent: number;
  /** True when conversions already qualify for a higher tier than stored. */
  eligibleForPromotion: boolean;
}

export function tierByConversions(conversions: number): AmbassadorTier {
  let earned: AmbassadorTier = "BRONZE";
  for (const step of TIER_LADDER) {
    if (conversions >= step.minConversions) earned = step.tier;
  }
  return earned;
}

export function tierProgress(stored: AmbassadorTier, conversions: number): TierProgress {
  const idx = TIER_LADDER.findIndex((t) => t.tier === stored);
  const current = TIER_LADDER[Math.max(0, idx)];
  const next = TIER_LADDER[idx + 1] ?? null;

  const bandStart = current.minConversions;
  const bandEnd = next?.minConversions ?? current.minConversions;
  const span = bandEnd - bandStart;

  const percent =
    next == null
      ? 100
      : Math.min(100, Math.max(0, Math.round(((conversions - bandStart) / Math.max(1, span)) * 100)));

  return {
    current: current.tier,
    currentLabel: current.label,
    next: next?.tier ?? null,
    nextLabel: next?.label ?? null,
    conversions,
    toNext: next ? Math.max(0, next.minConversions - conversions) : 0,
    percent,
    eligibleForPromotion:
      TIER_LADDER.findIndex((t) => t.tier === tierByConversions(conversions)) > Math.max(0, idx),
  };
}

/** Public referral link for a code, given the site origin. */
export function referralLink(origin: string, code: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/intake?ref=${encodeURIComponent(code)}`;
}

/**
 * Readable referral code from a name: first alpha chunk (up to 6) + 3 random
 * base36 chars, uppercased — e.g. BLESSING → "BLESSI-4A2".
 */
export function generateReferralCode(fullName: string): string {
  const stem =
    fullName
      .replace(/[^a-zA-Z]/g, "")
      .slice(0, 6)
      .toUpperCase() || "AMB";
  const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${stem}-${suffix}`;
}
