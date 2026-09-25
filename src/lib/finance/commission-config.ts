/**
 * EduCraft's money rules — the ONE place every rate lives (Phase 2 spec:
 * "no rate appears hardcoded in any component or API route"). Pure: no
 * database, no Node APIs, so client components, the finance services and
 * `npm run check:finance` all read the same numbers.
 *
 * Money is whole naira, like everywhere else in HQ (pricing.ts, commission.ts):
 * `nairaPercent` rounds with Math.round, and every split gives its remainder
 * to the last leg so the parts always add up to the whole.
 *
 * Tier percentages here are the shipped defaults; Settings > General can
 * override the four tier rates live (getCommissionRates), and a job's own
 * legs are frozen on the Project the moment it is allocated.
 */
import type { BucketType } from "@prisma/client";

export const COMMISSION_RATES = {
  // Direct from project revenue
  workers: 0.4, // 40% — paid to the specialist who wrote the report
  ambassador: 0.15, // 15% — EduCraft always pays exactly 15% total per referred project
  //                   (split between Core and Sub if applicable — see calculateAmbassadorSplit)
  hog: 0.025, // 2.5% — Head of Growth, on all ambassador-driven projects
  coo: 0.025, // 2.5% — COO, on all delivered projects

  // EduCraft retains 40% on the standard referred project (100 − 40 − 15 − 2.5 − 2.5).
  // When a Growth Associate is active: retains 38% (2% redirected from the retained share).
  growthAssociate: 0.02, // Year 2, currently inactive

  // Bucket allocations — % of EduCraft's RETAINED SHARE, not of total revenue.
  buckets: {
    operationsReserve: 0.375, // 37.5% of retained = 15% of total revenue
    growthFund: 0.175, // 17.5% of retained = 7% of total revenue
    reinvestmentFund: 0.175, // 17.5% of retained = 7% of total revenue
    founderDistribution: 0.275, // 27.5% of retained = 11% of total revenue
  },

  // Founder draw tiers — monthly, 50/50 between CEO and CFO, paid from the Founder Distribution bucket.
  founderDrawTiers: [
    { minRevenue: 0, maxRevenue: 499_999, drawEach: 0 },
    { minRevenue: 500_000, maxRevenue: 999_999, drawEach: 25_000 },
    { minRevenue: 1_000_000, maxRevenue: 2_499_999, drawEach: 75_000 },
    { minRevenue: 2_500_000, maxRevenue: 4_999_999, drawEach: 150_000 },
    { minRevenue: 5_000_000, maxRevenue: 9_999_999, drawEach: 300_000 },
    { minRevenue: 10_000_000, maxRevenue: Infinity, drawEach: 500_000 },
  ],
} as const;

/** What EduCraft keeps on the standard referred project — the sanity check the spec asks for. */
export const STANDARD_RETAINED_RATE = 1 - COMMISSION_RATES.workers - COMMISSION_RATES.ambassador - COMMISSION_RATES.hog - COMMISSION_RATES.coo;

// ── Ambassador tiers ─────────────────────────────────────────────────────

/** Lifetime conversions = paying clients referred (a referred client whose downpayment was verified). */
export const AMBASSADOR_TIERS = [
  { name: "BRONZE", label: "Bronze", minConversions: 0, maxConversions: 5, rate: 0.1 },
  { name: "SILVER", label: "Silver", minConversions: 6, maxConversions: 15, rate: 0.12 },
  { name: "GOLD", label: "Gold", minConversions: 16, maxConversions: 30, rate: 0.15 },
  { name: "PLATINUM", label: "Platinum", minConversions: 31, maxConversions: Infinity, rate: 0.15 },
] as const;

export type TierName = (typeof AMBASSADOR_TIERS)[number]["name"];

/** ₦3,000 per client referred in the quarter, for Platinum ambassadors. */
export const PLATINUM_QUARTERLY_BONUS_PER_CLIENT = 3000;

/** The quarterly challenge (Phase 3): refer this many paying clients in the quarter for a flat bonus. Any tier. */
export const QUARTERLY_CHALLENGE = { target: 10, bonus: 35_000, extensionDays: 7 } as const;

/** The tier earned by a lifetime count of paying clients. */
export function tierFor(payingClients: number): TierName {
  const n = Math.max(0, Math.floor(payingClients));
  const tier = AMBASSADOR_TIERS.find((t) => n >= t.minConversions && n <= t.maxConversions) ?? AMBASSADOR_TIERS[0];
  return tier.name;
}

/** The commission fraction for a lifetime count of paying clients. */
export function tierRateFor(payingClients: number): number {
  const name = tierFor(payingClients);
  return AMBASSADOR_TIERS.find((t) => t.name === name)?.rate ?? AMBASSADOR_TIERS[0].rate;
}

/** Rate fraction of a tier by name (BRONZE → 0.10). */
export function rateForTier(name: string): number {
  return AMBASSADOR_TIERS.find((t) => t.name === name)?.rate ?? AMBASSADOR_TIERS[0].rate;
}

/** Fractions are kept to four decimals so 0.15 − 0.12 is 0.03, not 0.030000000000000002. */
export function roundRate(rate: number): number {
  return Math.round(rate * 10_000) / 10_000;
}

/**
 * Core/Sub override — EduCraft's total is always 15%. The Sub keeps their tier
 * rate; the Core gets the rest: Bronze sub → 10% + 5%, Silver sub → 12% + 3%,
 * Gold/Platinum sub → 15% + 0%.
 */
export function calculateAmbassadorSplit(subTierRate: number): { subRate: number; coreOverride: number } {
  const subRate = roundRate(subTierRate);
  return { subRate, coreOverride: roundRate(Math.max(0, COMMISSION_RATES.ambassador - subRate)) };
}

// ── Money helpers ────────────────────────────────────────────────────────

/** Whole-naira share of an amount. Negative amounts (true-up deltas) round the same way. */
export function nairaPercent(amount: number, rate: number): number {
  return Math.round(amount * rate);
}

export const BUCKET_TYPES: readonly BucketType[] = ["OPERATIONS_RESERVE", "GROWTH_FUND", "REINVESTMENT_FUND", "FOUNDER_DISTRIBUTION"];

export interface BucketAmounts {
  operationsReserve: number;
  growthFund: number;
  reinvestmentFund: number;
  founderDistribution: number;
}

export const BUCKET_KEY: Record<BucketType, keyof BucketAmounts> = {
  OPERATIONS_RESERVE: "operationsReserve",
  GROWTH_FUND: "growthFund",
  REINVESTMENT_FUND: "reinvestmentFund",
  FOUNDER_DISTRIBUTION: "founderDistribution",
};

export const BUCKET_META: Record<BucketType, { label: string; purpose: string; shareOfRetained: number }> = {
  OPERATIONS_RESERVE: {
    label: "Operations Reserve",
    purpose: "Platform costs, Claude API, software, emergencies",
    shareOfRetained: COMMISSION_RATES.buckets.operationsReserve,
  },
  GROWTH_FUND: {
    label: "Growth Fund",
    purpose: "Ambassador bonuses, sponsorships, school entry",
    shareOfRetained: COMMISSION_RATES.buckets.growthFund,
  },
  REINVESTMENT_FUND: {
    label: "Reinvestment Fund",
    purpose: "Platform development, new services, equipment, legal",
    shareOfRetained: COMMISSION_RATES.buckets.reinvestmentFund,
  },
  FOUNDER_DISTRIBUTION: {
    label: "Founder Distribution",
    purpose: "CEO and Co-CEO/CFO monthly draws and bonuses",
    shareOfRetained: COMMISSION_RATES.buckets.founderDistribution,
  },
};

/** Share of TOTAL revenue a bucket gets on the standard referred project (37.5% of 40% = 15%). */
export function bucketShareOfRevenue(bucket: BucketType): number {
  return roundRate(BUCKET_META[bucket].shareOfRetained * STANDARD_RETAINED_RATE);
}

/**
 * Split a retained amount into the four buckets. Each is rounded to whole
 * naira and Founder Distribution takes the remainder, so the four always sum
 * to exactly the amount split — for negative deltas too.
 */
export function bucketSplit(retained: number): BucketAmounts {
  const operationsReserve = nairaPercent(retained, COMMISSION_RATES.buckets.operationsReserve);
  const growthFund = nairaPercent(retained, COMMISSION_RATES.buckets.growthFund);
  const reinvestmentFund = nairaPercent(retained, COMMISSION_RATES.buckets.reinvestmentFund);
  const founderDistribution = retained - operationsReserve - growthFund - reinvestmentFund;
  return { operationsReserve, growthFund, reinvestmentFund, founderDistribution };
}

// ── Per-project legs ─────────────────────────────────────────────────────

/** The money fields of a project the engine needs (the names are the Prisma columns). */
export interface ProjectLegs {
  price: number;
  workerPayout: number | null;
  workerPayoutRate?: number | null;
  ambassadorCommission: number | null;
  parentCommission: number | null;
  ambassadorId: string | null;
  isProBono?: boolean;
}

export function workerLeg(p: ProjectLegs): number {
  if (p.isProBono) return 0;
  if (p.workerPayout != null) return p.workerPayout;
  const rate = p.workerPayoutRate != null ? p.workerPayoutRate / 100 : COMMISSION_RATES.workers;
  return nairaPercent(p.price, rate);
}

/** HOG earns only on ambassador-driven projects; the COO on every delivered one. */
export function executiveLegs(p: ProjectLegs): { hog: number; coo: number } {
  if (p.isProBono || p.price <= 0) return { hog: 0, coo: 0 };
  return {
    hog: p.ambassadorId ? nairaPercent(p.price, COMMISSION_RATES.hog) : 0,
    coo: nairaPercent(p.price, COMMISSION_RATES.coo),
  };
}

/**
 * What EduCraft actually keeps of a project: the price less every leg owed
 * out. 40% of the standard referred job (worker 40, ambassador 15, HOG 2.5,
 * COO 2.5); 57.5% of a direct job (no ambassador, no HOG leg). Never below 0.
 */
export function retainedForProject(p: ProjectLegs): number {
  if (p.isProBono || p.price <= 0) return 0;
  const { hog, coo } = executiveLegs(p);
  const retained = p.price - workerLeg(p) - (p.ambassadorCommission ?? 0) - (p.parentCommission ?? 0) - hog - coo;
  return Math.max(0, Math.round(retained));
}

/** retained ÷ price, to four decimals (0.4 on the standard job). */
export function retainedRateFor(p: ProjectLegs): number {
  return p.price > 0 ? roundRate(retainedForProject(p) / p.price) : 0;
}

/**
 * How much of a project's retained share the buckets should hold given the
 * money actually in (confirmed inflows less refunds): the whole share when
 * fully paid, the proportional part after the downpayment. Whole naira.
 */
export function expectedAllocation(p: ProjectLegs, netInflow: number): number {
  if (p.price <= 0 || netInflow <= 0) return 0;
  const retained = retainedForProject(p);
  if (netInflow >= p.price) return retained;
  return Math.round((retained * netInflow) / p.price);
}

// ── Founder draws ────────────────────────────────────────────────────────

export interface FounderDrawTier {
  minRevenue: number;
  maxRevenue: number;
  drawEach: number;
}

/** The tier a month's confirmed revenue falls in. */
export function founderDrawFor(monthRevenue: number): FounderDrawTier {
  const r = Math.max(0, monthRevenue);
  return COMMISSION_RATES.founderDrawTiers.find((t) => r >= t.minRevenue && r <= t.maxRevenue) ?? COMMISSION_RATES.founderDrawTiers[0];
}

export interface SemesterSurplusInput {
  /** Operations Reserve balance now. */
  operationsReserve: number;
  /** Monthly operating cost baseline (Setting; ₦150K until real data exists). */
  operatingBaseline: number;
  /** Everything that flowed into Founder Distribution in the semester. */
  founderDistributionInflows: number;
  /** Monthly draws already paid out of it in the semester. */
  founderDrawsPaid: number;
  /** What Founder Distribution actually holds now: the bonus can never exceed it. */
  founderDistributionBalance?: number;
}

export interface SemesterSurplus {
  requiredMinimum: number;
  operationsSurplus: number;
  operationsRelease: number;
  founderAvailable: number;
  total: number;
  each: number;
}

/**
 * The spec's semester-end analysis: keep 3 months of operating cost in the
 * Operations Reserve and release half of anything above it; release all of
 * the Founder Distribution not already drawn. Split 50/50.
 */
export function semesterSurplus(input: SemesterSurplusInput): SemesterSurplus {
  const requiredMinimum = input.operatingBaseline * 3;
  const operationsSurplus = Math.max(0, Math.round(input.operationsReserve - requiredMinimum));
  const operationsRelease = nairaPercent(operationsSurplus, 0.5);
  const founderAvailable = Math.max(
    0,
    Math.round(Math.min(input.founderDistributionInflows - input.founderDrawsPaid, input.founderDistributionBalance ?? Number.POSITIVE_INFINITY))
  );
  const total = operationsRelease + founderAvailable;
  return { requiredMinimum, operationsSurplus, operationsRelease, founderAvailable, total, each: Math.floor(total / 2) };
}

export interface AnnualProfitShare {
  totalBalances: number;
  q1Reserve: number;
  available: number;
  each: number;
}

/** December: the surplus across all four buckets beyond the next quarter's operating reserve, 50/50. */
export function annualProfitShare(balances: BucketAmounts, operatingBaseline: number): AnnualProfitShare {
  const totalBalances = Math.round(balances.operationsReserve + balances.growthFund + balances.reinvestmentFund + balances.founderDistribution);
  const q1Reserve = operatingBaseline * 3;
  const available = Math.max(0, totalBalances - q1Reserve);
  return { totalBalances, q1Reserve, available, each: Math.floor(available / 2) };
}

// ── Bucket health ────────────────────────────────────────────────────────

export type BucketHealthLevel = "healthy" | "monitor" | "attention";

export interface BucketHealth {
  level: BucketHealthLevel;
  /** balance ÷ target, capped at 100. */
  percent: number;
  target: number;
  rule: string;
}

/** Shipped defaults for the two Settings the health rules read. */
export const FINANCE_DEFAULTS = {
  /** ₦ per month of operating cost until real data exists (spec baseline). */
  operatingCostMonthlyBaseline: 150_000,
  /** The monthly revenue the three non-operations buckets are measured against. */
  bucketReferenceRevenue: 1_000_000,
  /** The HOG's sponsorship budget per quarter, from the Growth Fund. */
  hogSponsorshipBudgetQuarterly: 150_000,
  /** Expenses above this need the CEO's approval unless the CEO logged them. */
  expenseApprovalThreshold: 50_000,
} as const;

/**
 * Operations Reserve is judged the way the spec says — months of operating
 * cost (≥ 3 healthy, ≥ 1 monitor, else attention). The other three are small
 * by design (7–11% of revenue), so they are judged against their own target:
 * their share of the retained 40% on a reference month's revenue (≥ 75%
 * healthy, ≥ 33% monitor).
 */
export function bucketHealth(
  bucket: BucketType,
  balance: number,
  settings: { operatingBaseline: number; referenceRevenue: number }
): BucketHealth {
  if (bucket === "OPERATIONS_RESERVE") {
    const target = settings.operatingBaseline * 3;
    const level: BucketHealthLevel = balance >= target ? "healthy" : balance >= settings.operatingBaseline ? "monitor" : "attention";
    return { level, percent: percentOf(balance, target), target, rule: "3 months of operating cost" };
  }
  const target = Math.round(settings.referenceRevenue * bucketShareOfRevenue(bucket));
  const level: BucketHealthLevel = balance >= target * 0.75 ? "healthy" : balance >= target / 3 ? "monitor" : "attention";
  return { level, percent: percentOf(balance, target), target, rule: `${Math.round(bucketShareOfRevenue(bucket) * 1000) / 10}% of a reference month` };
}

function percentOf(balance: number, target: number): number {
  if (target <= 0) return balance > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((balance / target) * 100)));
}

// ── Aging, thresholds ────────────────────────────────────────────────────

/** Outstanding-balance aging bands, in days since the downpayment. */
export function agingBand(days: number): "normal" | "follow_up" | "escalate" {
  if (days > 14) return "escalate";
  if (days >= 7) return "follow_up";
  return "normal";
}

/** Whether an expense of this amount, logged by this role, waits for the CEO. */
export function expenseNeedsApproval(amount: number, loggedByRole: string): boolean {
  return amount > FINANCE_DEFAULTS.expenseApprovalThreshold && loggedByRole !== "SUPER_ADMIN";
}
