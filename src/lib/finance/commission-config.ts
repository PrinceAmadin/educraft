/**
 * EduCraft's money maths. Every rate comes from a published cashflow
 * structure (`CashflowStructure`, the JSON on a `CashflowVersion` row): no
 * percentage lives in this file. Pure — no database, no Node APIs — so client
 * components, the finance services and the check scripts share the same
 * functions, each handed the structure it should compute under (a project's
 * own version, or the active one).
 *
 * Money is whole naira, like everywhere else in HQ: `nairaPercent` rounds
 * with Math.round, and every split gives its remainder to one row so the
 * parts always add up to the whole.
 */
import type { AmbassadorTier, BucketType } from "@prisma/client";
import {
  BUCKET_KEYS,
  LEVEL1,
  isActiveRow,
  level1Row,
  potsOf,
  recipientsPercent,
  retainedFraction,
  tierRule,
  type CashflowStructure,
  type PersonTrigger,
  type TierRule,
} from "@/lib/finance/cashflow-types";

/** Fractions are kept to four decimals so 0.15 − 0.12 is 0.03, not 0.030000000000000002. */
export function roundRate(rate: number): number {
  return Math.round(rate * 10_000) / 10_000;
}

/** Whole-naira share of an amount. Negative amounts (true-up deltas) round the same way. */
export function nairaPercent(amount: number, rate: number): number {
  return Math.round(amount * rate);
}

// ── Tiers ────────────────────────────────────────────────────────────────

/** The tier a lifetime count of paying clients earns under the ladder. */
export function tierFor(payingClients: number, tiers: readonly TierRule[]): AmbassadorTier {
  const n = Math.max(0, Math.floor(payingClients));
  let tier: AmbassadorTier = "BRONZE";
  for (const t of [...tiers].sort((a, b) => a.minConversions - b.minConversions)) if (n >= t.minConversions) tier = t.key;
  return tier;
}

/** Commission fraction of a tier (BRONZE → 0.10). */
export function rateForTier(tier: AmbassadorTier, tiers: readonly TierRule[]): number {
  const t = tiers.find((x) => x.key === tier) ?? [...tiers].sort((a, b) => a.minConversions - b.minConversions)[0];
  return t ? roundRate(t.ratePercent / 100) : 0;
}

/** Commission fraction for a lifetime count of paying clients. */
export function tierRateFor(payingClients: number, tiers: readonly TierRule[]): number {
  return rateForTier(tierFor(payingClients, tiers), tiers);
}

/** A tier's rate as a whole-percent figure with two decimals (BRONZE → 10), the form the project columns store. */
export function ratePercentForTier(tier: AmbassadorTier, tiers: readonly TierRule[]): number {
  return Math.round(rateForTier(tier, tiers) * 10_000) / 100;
}

/** The ambassador total EduCraft pays on a referred job, as a fraction (0.15). */
export function ambassadorTotalRate(s: CashflowStructure): number {
  return roundRate(recipientsPercent(s, "ambassadors") / 100);
}

/**
 * Core/Sub override — EduCraft's total is fixed by the Ambassador row. The Sub
 * keeps their tier rate; the Core gets the rest: Bronze sub → 10% + 5%,
 * Silver sub → 12% + 3%, Gold/Platinum sub → 15% + 0%.
 */
export function calculateAmbassadorSplit(subTierRate: number, s: CashflowStructure): { subRate: number; coreOverride: number } {
  const subRate = roundRate(subTierRate);
  return { subRate, coreOverride: roundRate(Math.max(0, ambassadorTotalRate(s) - subRate)) };
}

// ── Buckets ──────────────────────────────────────────────────────────────

export const BUCKET_TYPES: readonly BucketType[] = BUCKET_KEYS;

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

/** Shipped labels and purposes for the four bucket enum values; a published structure may relabel them. */
export const BUCKET_META: Record<BucketType, { label: string; purpose: string }> = {
  OPERATIONS_RESERVE: { label: "Operations Reserve", purpose: "Platform costs, Claude API, software, emergencies" },
  GROWTH_FUND: { label: "Growth Fund", purpose: "Ambassador bonuses, sponsorships, school entry" },
  REINVESTMENT_FUND: { label: "Reinvestment Fund", purpose: "Platform development, new services, equipment, legal" },
  FOUNDER_DISTRIBUTION: { label: "Founder Distribution", purpose: "CEO and Co-CEO/CFO monthly draws and bonuses" },
};

export function bucketLabel(bucket: BucketType, s?: CashflowStructure | null): string {
  return s?.level2.find((b) => b.key === bucket)?.label ?? BUCKET_META[bucket].label;
}

/** A bucket's share of the retained share, as a fraction (0.375). */
export function bucketShareOfRetained(bucket: BucketType, s: CashflowStructure): number {
  const row = s.level2.find((b) => b.key === bucket);
  return row ? roundRate(row.percentage / 100) : 0;
}

/** Share of TOTAL revenue a bucket gets on the standard referred project (37.5% of 40% = 15%). */
export function bucketShareOfRevenue(bucket: BucketType, s: CashflowStructure): number {
  return roundRate(bucketShareOfRetained(bucket, s) * retainedFraction(s));
}

/**
 * Split an amount across rows by their percentages, whole naira each, with
 * the remainder on the absorber row (else the last row) so the parts always
 * sum to exactly the amount — for negative deltas too.
 */
export function splitByRows<T extends { key: string; percentage: number; isAbsorber?: boolean; active?: boolean }>(amount: number, rows: readonly T[]): Map<string, number> {
  const live = rows.filter(isActiveRow);
  const out = new Map<string, number>();
  if (live.length === 0) return out;
  const remainderRow = live.find((r) => r.isAbsorber) ?? live[live.length - 1];
  let used = 0;
  for (const r of live) {
    if (r === remainderRow) continue;
    const part = nairaPercent(amount, r.percentage / 100);
    out.set(r.key, part);
    used += part;
  }
  out.set(remainderRow.key, Math.round(amount) - used);
  return out;
}

/** Split a retained amount into the four buckets under the structure. */
export function bucketSplit(retained: number, s: CashflowStructure): BucketAmounts {
  const parts = splitByRows(retained, s.level2);
  return {
    operationsReserve: parts.get("OPERATIONS_RESERVE") ?? 0,
    growthFund: parts.get("GROWTH_FUND") ?? 0,
    reinvestmentFund: parts.get("REINVESTMENT_FUND") ?? 0,
    founderDistribution: parts.get("FOUNDER_DISTRIBUTION") ?? 0,
  };
}

/** Split a bucket's delta across its tracked pots (empty when the bucket has none). */
export function potSplit(bucketDelta: number, parentKey: BucketType, s: CashflowStructure): Map<string, number> {
  return splitByRows(bucketDelta, potsOf(s, parentKey).filter((p) => p.isTrackedAsPot));
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

export function workerLeg(p: ProjectLegs, s: CashflowStructure): number {
  if (p.isProBono) return 0;
  if (p.workerPayout != null) return p.workerPayout;
  const rate = p.workerPayoutRate != null ? p.workerPayoutRate / 100 : recipientsPercent(s, "workers") / 100;
  return nairaPercent(p.price, rate);
}

export interface PersonLeg {
  key: string;
  label: string;
  /** HOG / COO, or null for a row that pays one named login. */
  role: "HOG" | "COO" | null;
  assignedUserId: string | null;
  ratePercent: number;
  amount: number;
  trigger: PersonTrigger;
}

/**
 * The single-recipient people rows a project owes — the HOG (ambassador-driven
 * jobs only), the COO, and any person the founder added — each a share of the
 * price. Workers and ambassadors are not here: their legs are frozen on the
 * project at allocation.
 */
export function personLegs(p: ProjectLegs, s: CashflowStructure): PersonLeg[] {
  if (p.isProBono || p.price <= 0) return [];
  const out: PersonLeg[] = [];
  for (const row of s.level1) {
    if (row.kind !== "person" || !isActiveRow(row)) continue;
    if (row.recipients !== "role" && row.recipients !== "user") continue;
    if (row.condition === "ambassador_driven" && !p.ambassadorId) continue;
    if (row.recipients === "user" && !row.assignedUserId) continue;
    const amount = nairaPercent(p.price, row.percentage / 100);
    if (amount <= 0) continue;
    out.push({
      key: row.key,
      label: row.label,
      role: row.recipients === "role" ? (row.role ?? null) : null,
      assignedUserId: row.recipients === "user" ? (row.assignedUserId ?? null) : null,
      ratePercent: row.percentage,
      amount,
      trigger: row.trigger ?? "completion",
    });
  }
  return out;
}

/** The HOG and COO legs by role (0 when the structure has no such row or the condition fails). */
export function executiveLegs(p: ProjectLegs, s: CashflowStructure): { hog: number; coo: number } {
  const legs = personLegs(p, s);
  return {
    hog: legs.filter((l) => l.role === "HOG").reduce((sum, l) => sum + l.amount, 0),
    coo: legs.filter((l) => l.role === "COO").reduce((sum, l) => sum + l.amount, 0),
  };
}

/**
 * What EduCraft actually keeps of a project: the price less every leg owed
 * out. 40% of the standard referred job (worker 40, ambassador 15, HOG 2.5,
 * COO 2.5); 57.5% of a direct job (no ambassador, no HOG leg). Never below 0.
 */
export function retainedForProject(p: ProjectLegs, s: CashflowStructure): number {
  if (p.isProBono || p.price <= 0) return 0;
  const people = personLegs(p, s).reduce((sum, l) => sum + l.amount, 0);
  const retained = p.price - workerLeg(p, s) - (p.ambassadorCommission ?? 0) - (p.parentCommission ?? 0) - people;
  return Math.max(0, Math.round(retained));
}

/** retained ÷ price, to four decimals (0.4 on the standard job). */
export function retainedRateFor(p: ProjectLegs, s: CashflowStructure): number {
  return p.price > 0 ? roundRate(retainedForProject(p, s) / p.price) : 0;
}

/**
 * How much of a project's retained share the buckets should hold given the
 * money actually in (confirmed inflows less refunds): the whole share when
 * fully paid, the proportional part after the downpayment. Whole naira.
 */
export function expectedAllocation(p: ProjectLegs, netInflow: number, s: CashflowStructure): number {
  if (p.price <= 0 || netInflow <= 0) return 0;
  const retained = retainedForProject(p, s);
  if (netInflow >= p.price) return retained;
  return Math.round((retained * netInflow) / p.price);
}

/** The same, per bucket: what each bucket should hold for the project now. */
export function expectedBucketAllocation(p: ProjectLegs, netInflow: number, s: CashflowStructure): BucketAmounts {
  return bucketSplit(expectedAllocation(p, netInflow, s), s);
}

// ── Founder draws ────────────────────────────────────────────────────────

export interface FounderDrawTier {
  minRevenue: number;
  maxRevenue: number;
  drawEach: number;
}

/** The structure's draw brackets in the engine's shape (an open top bracket reads as Infinity). */
export function founderDrawTiers(s: CashflowStructure): FounderDrawTier[] {
  return [...s.founderDrawTiers]
    .sort((a, b) => a.minRevenueNgn - b.minRevenueNgn)
    .map((t) => ({ minRevenue: t.minRevenueNgn, maxRevenue: t.maxRevenueNgn ?? Infinity, drawEach: t.drawPerFounderNgn }));
}

/** The tier a month's confirmed revenue falls in. */
export function founderDrawFor(monthRevenue: number, s: CashflowStructure): FounderDrawTier {
  const tiers = founderDrawTiers(s);
  const r = Math.max(0, monthRevenue);
  return tiers.find((t) => r >= t.minRevenue && r <= t.maxRevenue) ?? tiers[0] ?? { minRevenue: 0, maxRevenue: Infinity, drawEach: 0 };
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

/** Shipped defaults for the Settings the health rules read, and the approval threshold. */
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
 * their share of the retained share on a reference month's revenue (≥ 75%
 * healthy, ≥ 33% monitor).
 */
export function bucketHealth(
  bucket: BucketType,
  balance: number,
  settings: { operatingBaseline: number; referenceRevenue: number },
  s: CashflowStructure
): BucketHealth {
  if (bucket === "OPERATIONS_RESERVE") {
    const target = settings.operatingBaseline * 3;
    const level: BucketHealthLevel = balance >= target ? "healthy" : balance >= settings.operatingBaseline ? "monitor" : "attention";
    return { level, percent: percentOf(balance, target), target, rule: "3 months of operating cost" };
  }
  const share = bucketShareOfRevenue(bucket, s);
  const target = Math.round(settings.referenceRevenue * share);
  const level: BucketHealthLevel = balance >= target * 0.75 ? "healthy" : balance >= target / 3 ? "monitor" : "attention";
  return { level, percent: percentOf(balance, target), target, rule: `${Math.round(share * 1000) / 10}% of a reference month` };
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

/** The tier rule for a name, for callers that hold the whole structure. */
export function tierRuleOf(s: CashflowStructure, tier: AmbassadorTier): TierRule | undefined {
  return tierRule(s, tier);
}

/** The workers row's percentage (40) — what a new project freezes as its workerPayoutRate. */
export function workersPercent(s: CashflowStructure): number {
  return recipientsPercent(s, "workers");
}

export { LEVEL1, level1Row };
