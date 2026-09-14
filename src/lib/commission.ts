/**
 * Ambassador commission constants — no server dependencies, so client
 * components and the finance/report services can share them.
 */

/** Expense category the system uses for a job's ambassador commission. */
export const AMBASSADOR_COMMISSION_CATEGORY = "Ambassador commission";

/** Quick-pick rates — Bronze 10%, Silver 12%, Gold/Platinum 15%. */
export const COMMISSION_RATES = [10, 12, 15] as const;

/** Bounds for a custom rate the admin types in. */
export const MIN_COMMISSION_RATE = 1;
export const MAX_COMMISSION_RATE = 50;

export function commissionFor(price: number, rate: number): number {
  return Math.round((price * rate) / 100);
}

export function isValidCommissionRate(rate: number): boolean {
  return (
    Number.isFinite(rate) &&
    rate >= MIN_COMMISSION_RATE &&
    rate <= MAX_COMMISSION_RATE &&
    Math.round(rate * 100) === rate * 100
  );
}
