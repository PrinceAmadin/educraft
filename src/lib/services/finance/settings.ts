import { db } from "@/lib/db";
import { FINANCE_DEFAULTS } from "@/lib/finance/commission-config";

/**
 * The few finance numbers the founder can change without a deploy, stored as
 * Setting rows (edited on Settings > General, Super Admin). Everything else
 * — rates, splits, tiers — lives in commission-config.ts.
 */
export const FINANCE_SETTING_KEYS = {
  operatingCostMonthlyBaseline: "finance_operating_cost_monthly_baseline",
  bucketReferenceRevenue: "finance_bucket_reference_revenue",
  hogSponsorshipBudgetQuarterly: "finance_hog_sponsorship_budget_quarterly",
} as const;

export interface FinanceSettings {
  /** ₦ per month EduCraft needs to run — the Operations Reserve is judged against 3× this. */
  operatingCostMonthlyBaseline: number;
  /** The monthly revenue the other three buckets are measured against. */
  bucketReferenceRevenue: number;
  /** The HOG's student-union sponsorship budget per quarter, from the Growth Fund. */
  hogSponsorshipBudgetQuarterly: number;
}

export async function getFinanceSettings(): Promise<FinanceSettings> {
  const rows = await db.setting.findMany({ where: { key: { in: Object.values(FINANCE_SETTING_KEYS) } } });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const num = (key: string, fallback: number) => {
    const n = Number(byKey[key]);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    operatingCostMonthlyBaseline: num(FINANCE_SETTING_KEYS.operatingCostMonthlyBaseline, FINANCE_DEFAULTS.operatingCostMonthlyBaseline),
    bucketReferenceRevenue: num(FINANCE_SETTING_KEYS.bucketReferenceRevenue, FINANCE_DEFAULTS.bucketReferenceRevenue),
    hogSponsorshipBudgetQuarterly: num(FINANCE_SETTING_KEYS.hogSponsorshipBudgetQuarterly, FINANCE_DEFAULTS.hogSponsorshipBudgetQuarterly),
  };
}

export async function updateFinanceSettings(input: Partial<FinanceSettings>): Promise<void> {
  const writes = (Object.keys(FINANCE_SETTING_KEYS) as (keyof FinanceSettings)[])
    .filter((k) => input[k] !== undefined)
    .map((k) => ({ key: FINANCE_SETTING_KEYS[k], value: String(Math.round(input[k] as number)) }));
  if (writes.length === 0) return;
  await db.$transaction(
    writes.map((w) => db.setting.upsert({ where: { key: w.key }, update: { value: w.value }, create: { key: w.key, value: w.value } }))
  );
}
