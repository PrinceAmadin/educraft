/**
 * Proves the coupon rules with no database and no Claude:
 *
 *   npm run check:coupons
 *
 * The founder's rule is the thing under test — a coupon lowers what the client
 * pays and NOTHING else, so every leg stays on the list price and EduCraft's
 * retained share is what shrinks. The cap is the arithmetic line past which the
 * job cannot pay its own people, and only the CEO may cross it.
 *
 * Figures come from `DEFAULT_CASHFLOW` (equal to the published version), so
 * nothing here is a number typed by hand.
 */
import { DEFAULT_CASHFLOW } from "../src/lib/finance/cashflow-default";
import {
  expectedAllocation,
  payableOf,
  retainedForProject,
  retainedRateFor,
  shortfallForProject,
  type ProjectLegs,
} from "../src/lib/finance/commission-config";
import {
  applyCoupon,
  capCheck,
  COUPON_TEXT,
  couponCeilings,
  couponCodeIsValid,
  discountLabel,
  discountOf,
  downpaymentCover,
  normalizeCouponCode,
  obligationsOnList,
  referralProgressLine,
  validateCouponDraft,
  type CouponForPricing,
} from "../src/lib/finance/coupon-rules";
import { computePrice } from "../src/lib/pricing";

const s = DEFAULT_CASHFLOW;
let failures = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(wanted);
  if (a !== w) {
    failures++;
    console.log(`FAIL ${label}\n     got    ${a}\n     wanted ${w}`);
  }
}

const NOW = new Date("2026-11-26T12:00:00Z");
const money = (n: number) => `NGN ${Math.round(n).toLocaleString("en-NG")}`;

// ── The code itself ──────────────────────────────────────────────────────
expect("a typed code is upper-cased and stripped", normalizeCouponCode(" bring-10 ten "), "BRING-10TEN");
expect("punctuation and emoji are dropped", normalizeCouponCode("half*off!"), "HALFOFF");
expect("code shapes", ["ABC", "BRING-10", "AB", "-ABC", "ABC-", "A".repeat(25)].map(couponCodeIsValid),
  [true, true, false, false, false, false]);

// ── Validating a draft ───────────────────────────────────────────────────
const goodDraft = { code: "BRING10", percentOff: 50, ownerClientId: "c1", expectedReferrals: 10 };
expect("a sound draft has no problems", validateCouponDraft(goodDraft, NOW), []);
expect("both a percentage and an amount is refused",
  validateCouponDraft({ code: "X1", percentOff: 50, amountOffNgn: 5_000 }, NOW).includes(COUPON_TEXT.draft.needsOneDiscount), true);
expect("neither is refused",
  validateCouponDraft({ code: "X1" }, NOW).includes(COUPON_TEXT.draft.needsOneDiscount), true);
expect("101% is refused",
  validateCouponDraft({ code: "X1", percentOff: 101 }, NOW).includes(COUPON_TEXT.draft.percentRange), true);
expect("a past expiry is refused",
  validateCouponDraft({ ...goodDraft, expiresAt: new Date("2026-01-01") }, NOW).includes(COUPON_TEXT.draft.expiryPast), true);
expect("a friend rate with no owner is refused",
  validateCouponDraft({ code: "X1", percentOff: 50, friendPercentOff: 10 }, NOW).includes(COUPON_TEXT.draft.ownerNeededForFriendRate), true);
expect("0 uses is refused",
  validateCouponDraft({ ...goodDraft, maxRedemptions: 0 }, NOW).includes(COUPON_TEXT.draft.maxRedemptions), true);

// ── What comes off ───────────────────────────────────────────────────────
expect("50% of 70,000", discountOf(70_000, 50, null), 35_000);
expect("a flat amount", discountOf(70_000, null, 5_000), 5_000);
expect("an amount over the price is capped at the price", discountOf(70_000, null, 999_999), 70_000);
expect("an odd price rounds to whole naira", discountOf(70_001, 50, null), 35_001);
expect("a negative amount gives nothing", discountOf(70_000, null, -500), 0);

// ── Applying one to an order ─────────────────────────────────────────────
const base: CouponForPricing = {
  code: "BRING10", status: "ACTIVE", percentOff: 50, amountOffNgn: null, friendPercentOff: null,
  ownerClientId: "c1", serviceCodes: [], minOrderNgn: null, expiresAt: null,
  maxRedemptions: null, redemptionCount: 0, tagsReferrals: true,
};
const order = { listPrice: 70_000, serviceCode: "FYP-FULL", clientId: "c1", now: NOW, money };

expect("the owner gets the discount", applyCoupon({ coupon: base, ...order }),
  { kind: "discount", discountAmount: 35_000, isOwner: true, tagReferral: false });
expect("someone else is tagged, not discounted", applyCoupon({ coupon: base, ...order, clientId: "c2" }),
  { kind: "tag_only", discountAmount: 0, isOwner: false, tagReferral: true });
expect("someone else with a friend rate gets it",
  applyCoupon({ coupon: { ...base, friendPercentOff: 10 }, ...order, clientId: "c2" }),
  { kind: "discount", discountAmount: 7_000, isOwner: false, tagReferral: true });
expect("a code that tags nobody refuses a stranger",
  applyCoupon({ coupon: { ...base, tagsReferrals: false }, ...order, clientId: "c2" }),
  { kind: "refused", reason: COUPON_TEXT.refused.notYours });
expect("an ownerless code works for anyone",
  applyCoupon({ coupon: { ...base, ownerClientId: null }, ...order, clientId: "c9" }),
  { kind: "discount", discountAmount: 35_000, isOwner: true, tagReferral: false });
expect("a client who does not exist yet is not the owner",
  applyCoupon({ coupon: base, ...order, clientId: null }).kind, "tag_only");

for (const [status, reason] of [
  ["DRAFT", COUPON_TEXT.refused.draft],
  ["PENDING_APPROVAL", COUPON_TEXT.refused.pendingApproval],
  ["REVOKED", COUPON_TEXT.refused.revoked],
] as const) {
  expect(`status ${status} is refused`, applyCoupon({ coupon: { ...base, status }, ...order }),
    { kind: "refused", reason });
}
expect("an expired code is refused",
  applyCoupon({ coupon: { ...base, expiresAt: new Date("2026-11-25T00:00:00Z") }, ...order }),
  { kind: "refused", reason: COUPON_TEXT.refused.expired });
expect("a code for another service is refused",
  applyCoupon({ coupon: { ...base, serviceCodes: ["THESIS"] }, ...order, serviceLabel: "this order" }),
  { kind: "refused", reason: COUPON_TEXT.refused.wrongService("this order") });
expect("a code for the right service applies",
  applyCoupon({ coupon: { ...base, serviceCodes: ["FYP-FULL", "THESIS"] }, ...order }).kind, "discount");
expect("an order under the minimum is refused",
  applyCoupon({ coupon: { ...base, minOrderNgn: 80_000 }, ...order }),
  { kind: "refused", reason: COUPON_TEXT.refused.belowMinimum(money(80_000)) });
expect("a fully used code is refused",
  applyCoupon({ coupon: { ...base, maxRedemptions: 2, redemptionCount: 2 }, ...order }),
  { kind: "refused", reason: COUPON_TEXT.refused.usedUp });
expect("one use left still applies",
  applyCoupon({ coupon: { ...base, maxRedemptions: 2, redemptionCount: 1 }, ...order }).kind, "discount");

// ── The cap: what the job can fund out of its own price ──────────────────
const direct: ProjectLegs = {
  price: 70_000, workerPayout: null, ambassadorCommission: null, parentCommission: null, ambassadorId: null,
};
const referred: ProjectLegs = { ...direct, ambassadorCommission: 10_500, ambassadorId: "amb" };

expect("a direct ₦70K job owes out ₦26,600 (worker 35 + COO 3)", obligationsOnList(direct, s), 26_600);
expect("a referred one owes ₦39,200 (+ ambassador 15 + HOG 3)", obligationsOnList(referred, s), 39_200);
expect("pro bono owes nothing", obligationsOnList({ ...referred, isProBono: true }, s), 0);

expect("a direct job can carry 62%", capCheck(direct, 0, s).maxPercent, 62);
expect("a referred job can carry 44%", capCheck(referred, 0, s).maxPercent, 44);
expect("the founder's 50% on a direct order is fundable",
  capCheck(direct, 35_000, s), { obligations: 26_600, maxDiscount: 43_400, maxPercent: 62, payable: 35_000, shortfall: 0, ok: true });
expect("the same 50% on a referred order is ₦4,200 short",
  capCheck(referred, 35_000, s), { obligations: 39_200, maxDiscount: 30_800, maxPercent: 44, payable: 35_000, shortfall: 4_200, ok: false });
expect("exactly at the cap is allowed", capCheck(direct, 43_400, s).ok, true);
expect("one naira past the cap is not", capCheck(direct, 43_401, s).ok, false);
expect("100% off is short by everything owed", capCheck(direct, 70_000, s).shortfall, 26_600);

expect("the ceilings before any order exists", couponCeilings(s), { directMaxPercent: 62, referredMaxPercent: 44 });

// ── The money, end to end: the founder's own deal ────────────────────────
const discounted: ProjectLegs = { ...direct, discountAmount: 35_000 };
expect("the client is billed half", payableOf(discounted), 35_000);
expect("the worker and COO are still paid in full", obligationsOnList(discounted, s), 26_600);
expect("EduCraft keeps ₦8,400 instead of ₦43,400",
  [retainedForProject(direct, s), retainedForProject(discounted, s)], [43_400, 8_400]);
expect("the retained rate is of what came in", retainedRateFor(discounted, s), 0.24);
expect("nothing is short on a fundable discount", shortfallForProject(discounted, s), 0);
expect("an over-cap discount reports its shortfall",
  shortfallForProject({ ...referred, discountAmount: 35_000 }, s), 4_200);
expect("a discount never drives the retained share below zero",
  retainedForProject({ ...direct, discountAmount: 70_000 }, s), 0);

// Buckets follow the money in, measured against what the client was BILLED.
expect("paying the billed total allocates the whole retained share",
  expectedAllocation(discounted, 35_000, s), 8_400);
expect("the 45% downpayment allocates its share of it",
  expectedAllocation(discounted, 15_750, s), 3_780);
expect("overpaying never allocates more", expectedAllocation(discounted, 40_000, s), 8_400);
expect("nothing paid allocates nothing", expectedAllocation(discounted, 0, s), 0);
expect("an undiscounted project is unchanged", expectedAllocation(direct, 70_000, s), 43_400);

// ── The downpayment timing trap on a referred job ────────────────────────
const down = s.triggers.downpaymentPercent;
expect("18% of the list is owed the moment the downpayment lands",
  downpaymentCover(referred, 0, down, s).owedAtDownpayment, 12_600);
expect("a 50% discount still covers it at a 45% downpayment",
  downpaymentCover(referred, 35_000, down, s), { owedAtDownpayment: 12_600, downpayment: 15_750, ok: true, short: 0 });
expect("a thinner downpayment would not",
  downpaymentCover(referred, 35_000, 30, s), { owedAtDownpayment: 12_600, downpayment: 10_500, ok: false, short: 2_100 });
expect("a direct job owes nothing at the downpayment",
  downpaymentCover(direct, 35_000, down, s).owedAtDownpayment, 0);

// ── computePrice: the list price is untouched, the bill is not ───────────
const billed = computePrice({ basePrice: 70_000, downpaymentPercentage: down, discountAmount: 35_000 });
expect("the list price stays the commission basis", billed.total, 70_000);
expect("the client's bill is halved", [billed.discountAmount, billed.payable], [35_000, 35_000]);
expect("both legs come off the bill", [billed.downpaymentAmount, billed.balanceAmount], [15_750, 19_250]);
const plain = computePrice({ basePrice: 70_000, downpaymentPercentage: down });
expect("with no coupon nothing changes",
  [plain.total, plain.discountAmount, plain.payable, plain.downpaymentAmount, plain.balanceAmount],
  [70_000, 0, 70_000, 31_500, 38_500]);
expect("a discount over the price cannot make the bill negative",
  computePrice({ basePrice: 70_000, downpaymentPercentage: down, discountAmount: 99_999 }).payable, 0);

// ── Display ──────────────────────────────────────────────────────────────
expect("a round percentage reads as one", discountLabel(70_000, 35_000, money), "50%");
expect("an odd figure reads in naira", discountLabel(70_000, 4_321, money), money(4_321));
expect("referral progress", [referralProgressLine(10, 3), referralProgressLine(null, 1)],
  ["3 of 10 clients brought in", "1 client brought in"]);

// ── Every sentence is in COUPON_TEXT, none typed into the logic ──────────
const src = require("fs").readFileSync("src/lib/finance/coupon-rules.ts", "utf8");
const afterText = src.slice(src.indexOf("// ── The code itself"));
expect("no sentence is written outside COUPON_TEXT",
  /"[A-Z][a-z]+ [a-z]{2,}[^"]{15,}"/.test(afterText.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")), false);

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("Coupon rules hold: a discount is EduCraft's to carry, and the cap is arithmetic.");
