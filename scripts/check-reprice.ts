/**
 * Reprice money model, no database: re-applying the money paid onto a new
 * price (overpaid downpayment overflows into the balance), the overpayment
 * case, the fresh split, the payout-snapshot recompute and the already-paid
 * recovery, and that the price itself comes from the same pricing primitives
 * the intake uses (base + option, chapter shares, manual override).
 *
 *   npm run check:reprice
 */
import { reconcileClientLegs, reconcileSnapshots } from "../src/lib/finance/reprice-rules";
import { computePrice } from "../src/lib/pricing";
import { intakeBasePrice } from "../src/lib/chapter-pricing";

let failures = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(wanted);
  if (a !== w) {
    failures++;
    console.log(`FAIL ${label}\n     got    ${a}\n     wanted ${w}`);
  }
}

// ── Client legs: the stated case ──
// ₦90,000 → ₦70,000, ₦40,500 downpayment verified, balance unpaid.
const stated = reconcileClientLegs({
  newPrice: 70_000,
  moneyIn: 40_500,
  downpaymentVerified: true,
  balanceVerified: false,
  downpaymentPercentage: 45,
  currentDownpaymentAmount: 40_500,
});
expect("stated: balance = price − money in", stated.balanceAmount, 29_500);
expect("stated: remaining owed", stated.remaining, 29_500);
expect("stated: no overpayment", stated.overpayment, 0);
expect("stated: balance stays unpaid", stated.balanceStatus, "Unpaid");
expect("stated: downpayment left as history", stated.downpaymentAmount, 40_500);
expect("stated: downpayment status untouched", stated.downpaymentStatus, null);
expect("stated: balance not re-opened", stated.balanceReopened, false);

// ── Price rose, balance still owed ──
const rose = reconcileClientLegs({ newPrice: 90_000, moneyIn: 40_500, downpaymentVerified: true, balanceVerified: false, downpaymentPercentage: 45, currentDownpaymentAmount: 40_500 });
expect("price rose: balance = 49,500", rose.balanceAmount, 49_500);
expect("price rose: no overpayment", rose.overpayment, 0);

// ── Fully paid, then price drops → overpayment ──
const over = reconcileClientLegs({ newPrice: 70_000, moneyIn: 90_000, downpaymentVerified: true, balanceVerified: true, downpaymentPercentage: 45, currentDownpaymentAmount: 40_500 });
expect("overpay: balance cleared", over.balanceAmount, 0);
expect("overpay: balance verified", over.balanceStatus, "Verified");
expect("overpay: ₦20,000 overpaid", over.overpayment, 20_000);
expect("overpay: not re-opened", over.balanceReopened, false);

// ── Nothing paid yet → fresh 45/55 split on the new price ──
const fresh = reconcileClientLegs({ newPrice: 70_000, moneyIn: 0, downpaymentVerified: false, balanceVerified: false, downpaymentPercentage: 45, currentDownpaymentAmount: 0 });
expect("fresh: downpayment 45%", fresh.downpaymentAmount, 31_500);
expect("fresh: balance 55%", fresh.balanceAmount, 38_500);
expect("fresh: balance unpaid", fresh.balanceStatus, "Unpaid");
expect("fresh: remaining = full price", fresh.remaining, 70_000);

// ── Price rose while fully paid → balance re-opens ──
const reopen = reconcileClientLegs({ newPrice: 90_000, moneyIn: 70_000, downpaymentVerified: true, balanceVerified: true, downpaymentPercentage: 45, currentDownpaymentAmount: 31_500 });
expect("reopen: owes the gap", reopen.balanceAmount, 20_000);
expect("reopen: balance back to unpaid", reopen.balanceStatus, "Unpaid");
expect("reopen: clears the old reference", reopen.clearBalanceReference, true);
expect("reopen: flagged re-opened", reopen.balanceReopened, true);

// ── Payout snapshots: nothing paid yet, re-trued to the new price ──
const snaps = reconcileSnapshots({
  newPrice: 70_000,
  workerPayoutRate: 40,
  workerPayoutPaid: false,
  currentWorkerPayout: 36_000,
  ambassadorId: "amb1",
  ambassadorCommRate: 15,
  ambassadorCommPaid: false,
  currentAmbassadorCommission: 13_500,
  parentAmbassadorId: null,
  parentCommRate: null,
  parentCommPaid: false,
  currentParentCommission: null,
});
expect("snapshot: worker 40% of new price", snaps.workerPayout, 28_000);
expect("snapshot: ambassador 15% of new price", snaps.ambassadorCommission, 10_500);
expect("snapshot: no parent", snaps.parentCommission, null);
expect("snapshot: EduCraft revenue", snaps.educraftRevenue, 31_500);
expect("snapshot: no recoveries when unpaid", snaps.recoveries.length, 0);

// ── Payout snapshots: an already-paid ambassador is left, recovery surfaced ──
const paid = reconcileSnapshots({
  newPrice: 70_000,
  workerPayoutRate: 40,
  workerPayoutPaid: false,
  currentWorkerPayout: null,
  ambassadorId: "amb1",
  ambassadorCommRate: 15,
  ambassadorCommPaid: true,
  currentAmbassadorCommission: 13_500,
  parentAmbassadorId: null,
  parentCommRate: null,
  parentCommPaid: false,
  currentParentCommission: null,
});
expect("paid: ambassador snapshot kept at what was paid", paid.ambassadorCommission, 13_500);
expect("paid: one recovery raised", paid.recoveries.length, 1);
expect("paid: recovery delta (paid − shouldBe)", paid.recoveries[0]?.delta, 3_000);
expect("paid: EduCraft revenue uses the paid amount", paid.educraftRevenue, 70_000 - 28_000 - 13_500);

// ── Price comes from the same primitives the intake uses ──
expect(
  "FYP full + Data Analysis = ₦90,000",
  computePrice({ basePrice: intakeBasePrice({ serviceCode: "FYP-FULL", basePrice: 70_000, variantAddon: 20_000 }), expressSurcharge: 0, isExpressDelivery: false, downpaymentPercentage: 45, override: null }).total,
  90_000
);
expect(
  "dropping Data Analysis = ₦70,000",
  computePrice({ basePrice: intakeBasePrice({ serviceCode: "FYP-FULL", basePrice: 70_000, variantAddon: 0 }), expressSurcharge: 0, isExpressDelivery: false, downpaymentPercentage: 45, override: null }).total,
  70_000
);
expect(
  "manual override wins",
  computePrice({ basePrice: intakeBasePrice({ serviceCode: "FYP-FULL", basePrice: 70_000, variantAddon: 20_000 }), expressSurcharge: 0, isExpressDelivery: false, downpaymentPercentage: 45, override: 65_000 }).total,
  65_000
);
expect(
  "chapter order: Chapter 4 with Data Analysis = 35% of ₦90,000",
  computePrice({ basePrice: intakeBasePrice({ serviceCode: "FYP-CHAPTERS", basePrice: 70_000, variantAddon: 20_000, chapters: [4] }), expressSurcharge: 0, isExpressDelivery: false, downpaymentPercentage: 45, override: null }).total,
  31_500
);
expect(
  "chapter order: Chapter 4 without Data Analysis = 35% of ₦70,000",
  computePrice({ basePrice: intakeBasePrice({ serviceCode: "FYP-CHAPTERS", basePrice: 70_000, variantAddon: 0, chapters: [4] }), expressSurcharge: 0, isExpressDelivery: false, downpaymentPercentage: 45, override: null }).total,
  24_500
);

if (failures) {
  console.log(`\n${failures} reprice check(s) failed.`);
  process.exit(1);
}
console.log("check:reprice — all reprice money-model checks passed.");
