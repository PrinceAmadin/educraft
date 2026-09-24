/**
 * Proves the money rules in src/lib/finance/commission-config.ts against the
 * Phase 2 spec's "Mathematical accuracy" checklist, with no database.
 *
 *   npm run check:finance
 *
 * Fails (exit 1) on any mismatch. Run it after touching commission-config.ts.
 */
import {
  AMBASSADOR_TIERS,
  COMMISSION_RATES,
  STANDARD_RETAINED_RATE,
  agingBand,
  annualProfitShare,
  bucketHealth,
  bucketShareOfRevenue,
  bucketSplit,
  calculateAmbassadorSplit,
  executiveLegs,
  expectedAllocation,
  expenseNeedsApproval,
  founderDrawFor,
  nairaPercent,
  retainedForProject,
  retainedRateFor,
  roundRate,
  semesterSurplus,
  tierFor,
  tierRateFor,
  workerLeg,
} from "../src/lib/finance/commission-config";

let failures = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(wanted);
  if (a !== w) {
    failures++;
    console.log(`FAIL ${label}\n     got    ${a}\n     wanted ${w}`);
  }
}

// ── The structure adds to 100% ───────────────────────────────────────────
expect("workers + ambassador + HOG + COO + retained = 100%", roundRate(COMMISSION_RATES.workers + COMMISSION_RATES.ambassador + COMMISSION_RATES.hog + COMMISSION_RATES.coo + STANDARD_RETAINED_RATE), 1);
expect("EduCraft retains 40% on the standard job", roundRate(STANDARD_RETAINED_RATE), 0.4);
const b = COMMISSION_RATES.buckets;
expect("bucket shares of retained sum to 100%", roundRate(b.operationsReserve + b.growthFund + b.reinvestmentFund + b.founderDistribution), 1);
expect("bucket shares of total revenue", ["OPERATIONS_RESERVE", "GROWTH_FUND", "REINVESTMENT_FUND", "FOUNDER_DISTRIBUTION"].map((k) => bucketShareOfRevenue(k as never)), [0.15, 0.07, 0.07, 0.11]);

// ── Worker 40% on three test projects ────────────────────────────────────
for (const price of [70_000, 90_000, 8_000]) {
  expect(`worker payout = 40% of ₦${price}`, nairaPercent(price, COMMISSION_RATES.workers), price * 0.4);
  expect(`workerLeg falls back to 40% of ₦${price}`, workerLeg({ price, workerPayout: null, ambassadorCommission: null, parentCommission: null, ambassadorId: null }), price * 0.4);
}
expect("workerLeg prefers the frozen amount", workerLeg({ price: 70_000, workerPayout: 27_000, ambassadorCommission: null, parentCommission: null, ambassadorId: null }), 27_000);

// ── Tiers ────────────────────────────────────────────────────────────────
expect("tiers table", AMBASSADOR_TIERS.map((t) => `${t.name}:${t.minConversions}-${t.maxConversions}:${t.rate}`), ["BRONZE:0-5:0.1", "SILVER:6-15:0.12", "GOLD:16-30:0.15", "PLATINUM:31-Infinity:0.15"]);
expect("tier by paying clients", [0, 5, 6, 15, 16, 30, 31, 100].map(tierFor), ["BRONZE", "BRONZE", "SILVER", "SILVER", "GOLD", "GOLD", "PLATINUM", "PLATINUM"]);
expect("rate by paying clients", [0, 5, 6, 15, 16, 30, 31].map(tierRateFor), [0.1, 0.1, 0.12, 0.12, 0.15, 0.15, 0.15]);

// ── Core/Sub split: always 15% in total ──────────────────────────────────
expect("Bronze sub: 10% + Core 5%", calculateAmbassadorSplit(0.1), { subRate: 0.1, coreOverride: 0.05 });
expect("Silver sub: 12% + Core 3%", calculateAmbassadorSplit(0.12), { subRate: 0.12, coreOverride: 0.03 });
expect("Gold sub: 15% + Core 0%", calculateAmbassadorSplit(0.15), { subRate: 0.15, coreOverride: 0 });
expect("Platinum sub: 15% + Core 0%", calculateAmbassadorSplit(0.15), { subRate: 0.15, coreOverride: 0 });
expect("a custom 20% sub rate leaves the Core nothing (never negative)", calculateAmbassadorSplit(0.2).coreOverride, 0);
for (const rate of [0.1, 0.12, 0.15]) {
  const s = calculateAmbassadorSplit(rate);
  expect(`sub ${rate} + core = 15%`, roundRate(s.subRate + s.coreOverride), 0.15);
}

// ── Executive legs ───────────────────────────────────────────────────────
const referred = { price: 70_000, workerPayout: 28_000, ambassadorCommission: 10_500, parentCommission: null, ambassadorId: "amb" };
const direct = { price: 70_000, workerPayout: 28_000, ambassadorCommission: null, parentCommission: null, ambassadorId: null };
expect("HOG 2.5% + COO 2.5% on an ambassador-driven job", executiveLegs(referred), { hog: 1_750, coo: 1_750 });
expect("no HOG leg on a direct job; COO still 2.5%", executiveLegs(direct), { hog: 0, coo: 1_750 });
expect("pro bono: no executive legs", executiveLegs({ ...referred, isProBono: true }), { hog: 0, coo: 0 });

// ── Retained share and buckets ───────────────────────────────────────────
expect("standard referred ₦70K job retains ₦28,000 (40%)", retainedForProject(referred), 28_000);
expect("standard retained rate is 0.40", retainedRateFor(referred), 0.4);
expect("direct ₦70K job retains ₦40,250 (57.5%)", retainedForProject(direct), 40_250);
expect("direct retained rate is 0.575", retainedRateFor(direct), 0.575);
const bronzeSubSilverCore = { price: 70_000, workerPayout: 28_000, ambassadorCommission: 7_000, parentCommission: 3_500, ambassadorId: "sub" };
expect("Bronze sub (7,000) + Core (3,500) still retains 40%", retainedForProject(bronzeSubSilverCore), 28_000);
expect("pro bono retains nothing", retainedForProject({ ...referred, isProBono: true }), 0);
expect("₦28,000 splits 10,500 / 4,900 / 4,900 / 7,700", bucketSplit(28_000), { operationsReserve: 10_500, growthFund: 4_900, reinvestmentFund: 4_900, founderDistribution: 7_700 });
for (const amount of [28_000, 28_001, 40_250, 1, 3, -28_000, -7]) {
  const s = bucketSplit(amount);
  expect(`bucket split of ${amount} sums exactly`, s.operationsReserve + s.growthFund + s.reinvestmentFund + s.founderDistribution, amount);
}
expect("₦90K job: buckets sum to exactly 40% of value", (() => {
  const p = { price: 90_000, workerPayout: 36_000, ambassadorCommission: 13_500, parentCommission: null, ambassadorId: "a" };
  const s = bucketSplit(retainedForProject(p));
  return s.operationsReserve + s.growthFund + s.reinvestmentFund + s.founderDistribution;
})(), 36_000);
expect("odd price ₦70,001: retained is whole naira and buckets still sum to it", (() => {
  const p = { price: 70_001, workerPayout: nairaPercent(70_001, 0.4), ambassadorCommission: nairaPercent(70_001, 0.15), parentCommission: null, ambassadorId: "a" };
  const r = retainedForProject(p);
  const s = bucketSplit(r);
  return [Number.isInteger(r), s.operationsReserve + s.growthFund + s.reinvestmentFund + s.founderDistribution === r];
})(), [true, true]);

// Allocation follows the money in: 45% downpayment, then the rest — never more than the share
expect("after the 45% downpayment the buckets hold 45% of the retained share", expectedAllocation(referred, 31_500), 12_600);
expect("fully paid: the whole retained share", expectedAllocation(referred, 70_000), 28_000);
expect("overpaid (fee surcharge) never allocates more than the share", expectedAllocation(referred, 70_100), 28_000);
expect("refunded in full: nothing", expectedAllocation(referred, 0), 0);
expect("downpayment + balance allocations sum to the share (remainder on the last)", (() => {
  const first = expectedAllocation(referred, 31_500);
  const second = expectedAllocation(referred, 70_000) - first;
  return first + second;
})(), 28_000);

// ── Founder draw tiers ───────────────────────────────────────────────────
expect("draw tiers", [0, 499_999, 500_000, 999_999, 1_000_000, 2_499_999, 2_500_000, 4_999_999, 5_000_000, 9_999_999, 10_000_000, 50_000_000].map((r) => founderDrawFor(r).drawEach), [0, 0, 25_000, 25_000, 75_000, 75_000, 150_000, 150_000, 300_000, 300_000, 500_000, 500_000]);
expect("₦1M–₦2.5M revenue → ₦75,000 each founder", founderDrawFor(2_400_000).drawEach, 75_000);
expect("₦500K revenue → ₦25,000 each founder", founderDrawFor(500_000).drawEach, 25_000);

// ── Semester surplus (the spec's worked example) ─────────────────────────
expect("semester surplus example", semesterSurplus({ operationsReserve: 720_000, operatingBaseline: 150_000, founderDistributionInflows: 581_000, founderDrawsPaid: 450_000 }), {
  requiredMinimum: 450_000,
  operationsSurplus: 270_000,
  operationsRelease: 135_000,
  founderAvailable: 131_000,
  total: 266_000,
  each: 133_000,
});
expect("no surplus below the minimum reserve", semesterSurplus({ operationsReserve: 300_000, operatingBaseline: 150_000, founderDistributionInflows: 100_000, founderDrawsPaid: 150_000 }).total, 0);
expect("annual profit share keeps a quarter's reserve", annualProfitShare({ operationsReserve: 500_000, growthFund: 100_000, reinvestmentFund: 100_000, founderDistribution: 50_000 }, 150_000), {
  totalBalances: 750_000,
  q1Reserve: 450_000,
  available: 300_000,
  each: 150_000,
});

// ── Bucket health ────────────────────────────────────────────────────────
const s = { operatingBaseline: 150_000, referenceRevenue: 1_000_000 };
expect("Ops Reserve ≥ 3 months = healthy", bucketHealth("OPERATIONS_RESERVE", 450_000, s).level, "healthy");
expect("Ops Reserve between 1 and 3 months = monitor", bucketHealth("OPERATIONS_RESERVE", 285_000, s).level, "monitor");
expect("Ops Reserve under 1 month = attention", bucketHealth("OPERATIONS_RESERVE", 100_000, s).level, "attention");
expect("Ops Reserve percent of 3 months", bucketHealth("OPERATIONS_RESERVE", 285_000, s).percent, 63);
expect("Growth Fund target on a ₦1M reference month = ₦70,000", bucketHealth("GROWTH_FUND", 0, s).target, 70_000);
expect("Growth Fund at ₦133K = healthy", bucketHealth("GROWTH_FUND", 133_000, s).level, "healthy");
expect("Growth Fund at ₦30K = monitor", bucketHealth("GROWTH_FUND", 30_000, s).level, "monitor");
expect("Growth Fund at ₦10K = attention", bucketHealth("GROWTH_FUND", 10_000, s).level, "attention");
expect("Founder Distribution target = ₦110,000", bucketHealth("FOUNDER_DISTRIBUTION", 0, s).target, 110_000);

// ── Aging and approvals ──────────────────────────────────────────────────
expect("aging bands", [0, 6, 7, 14, 15, 40].map(agingBand), ["normal", "normal", "follow_up", "follow_up", "escalate", "escalate"]);
expect("₦50K needs no approval", expenseNeedsApproval(50_000, "CO_CEO_CFO"), false);
expect("₦50,001 by the CFO needs the CEO", expenseNeedsApproval(50_001, "CO_CEO_CFO"), true);
expect("₦50,001 by the CEO is auto-approved", expenseNeedsApproval(50_001, "SUPER_ADMIN"), false);

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("Finance maths match the spec.");
