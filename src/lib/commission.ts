/**
 * Ambassador commission constants — no server dependencies, so client
 * components and the finance/report services can share them.
 */

/** Expense category the system uses for a job's ambassador commission. */
export const AMBASSADOR_COMMISSION_CATEGORY = "Ambassador commission";
/** Expense category for what a parent (Core) ambassador earns from a sub's job. */
export const PARENT_COMMISSION_CATEGORY = "Parent ambassador commission";

/** Quick-pick rates — Bronze 10%, Silver 12%, Gold/Platinum 15%. */
export const COMMISSION_RATE_PRESETS = [10, 12, 15] as const;

/** Bounds for a custom rate the admin types in. */
export const MIN_COMMISSION_RATE = 1;
export const MAX_COMMISSION_RATE = 50;

/**
 * The parent-ambassador rate (CLAUDE.md's "5% from sub's referrals") — a
 * global default in Settings, with a per-relationship override the admin can
 * set when linking a sub to their parent. 0 is allowed: it links them without
 * paying a commission yet.
 */
export const DEFAULT_PARENT_COMMISSION_RATE = 5;
export const MIN_PARENT_COMMISSION_RATE = 0;
export const MAX_PARENT_COMMISSION_RATE = 50;

/** Max sub-ambassadors one parent can have, and how deep the chain goes. */
export const MAX_SUB_AMBASSADORS = 10;

/** Tiers whose parent-commission has "activated" (CLAUDE.md: requires Silver+). */
export const PARENT_ACTIVATION_TIERS = ["SILVER", "GOLD", "PLATINUM"] as const;

export function commissionFor(price: number, rate: number): number {
  return Math.round((price * rate) / 100);
}

function isRate(rate: number, min: number, max: number): boolean {
  return Number.isFinite(rate) && rate >= min && rate <= max && Math.round(rate * 100) === rate * 100;
}

export function isValidCommissionRate(rate: number): boolean {
  return isRate(rate, MIN_COMMISSION_RATE, MAX_COMMISSION_RATE);
}

export function isValidParentRate(rate: number): boolean {
  return isRate(rate, MIN_PARENT_COMMISSION_RATE, MAX_PARENT_COMMISSION_RATE);
}
