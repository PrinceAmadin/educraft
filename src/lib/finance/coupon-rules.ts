/**
 * Coupon rules — pure, no database, no Claude. `npm run check:coupons` proves
 * them and the app runs the very same functions.
 *
 * THE ONE RULE THE FOUNDER SET (26 Nov 2026): a coupon is EduCraft's to carry.
 * Workers, ambassadors, the Core, the HOG and the COO are all paid their normal
 * share OF THE LIST PRICE, exactly as if the client had paid in full. What the
 * discount comes out of is EduCraft's own retained share, which is a residual:
 *
 *     retained = (list price - discount) - every leg owed out
 *
 * So the company takes the whole risk, which is what he asked for. The limit is
 * arithmetic, not opinion: once the discount is deeper than the price less the
 * legs, the job cannot pay the people working on it out of its own money and
 * some other project's cash would have to. `capCheck` is that line, and only
 * the founder may cross it.
 */
import { isActiveRow, type CashflowStructure } from "@/lib/finance/cashflow-types";
import { personLegs, workerLeg, type ProjectLegs } from "@/lib/finance/commission-config";

/** Every sentence a person reads about a coupon, in one place for the founder. */
export const COUPON_TEXT = {
  refused: {
    unknown: "We don't recognise that code.",
    draft: "That code isn't switched on yet.",
    pendingApproval: "That code is waiting for approval.",
    revoked: "That code has been withdrawn.",
    expired: "That code has expired.",
    usedUp: "That code has been used as many times as it allows.",
    wrongService: (label: string) => `That code doesn't apply to ${label}.`,
    belowMinimum: (min: string) => `That code applies to orders of ${min} or more.`,
    notYours: "That code belongs to another client.",
    nothingToGive: "That code has nothing to take off this order.",
  },
  applied: {
    owner: (off: string) => `${off} off, applied.`,
    friend: (off: string) => `${off} off, applied.`,
    tagOnly: "Code accepted — it won't change your price, and the person who gave it to you gets the credit.",
  },
  cap: {
    /** Shown to whoever is creating the coupon, never to a client. */
    overCap: (deepest: string, shortfall: string) =>
      `This is deeper than the order can fund. The most it can carry is ${deepest}; beyond that ${shortfall} comes out of other projects' money.`,
    founderOnly: "Only the CEO can approve a discount deeper than the order can fund.",
    overrideNeedsReason: "Say why this discount is worth funding from the buckets.",
    atCap: (deepest: string) => `The deepest discount this order can fund on its own is ${deepest}.`,
    downpaymentTight: (owed: string, down: string) =>
      `Careful: ${owed} is owed out the moment the downpayment lands, and the downpayment is only ${down}. The rest has to come from the balance.`,
  },
  draft: {
    needsOneDiscount: "Give the code either a percentage or an amount off, not both.",
    percentRange: "A percentage off must be between 1 and 100.",
    amountPositive: "An amount off must be more than zero.",
    friendRange: "The discount for everyone else must be between 1 and 100 percent.",
    codeShape: "A code is 3 to 24 letters, numbers or dashes.",
    maxRedemptions: "The number of uses must be at least 1.",
    expiryPast: "The expiry date has already passed.",
    minOrderNegative: "A minimum order cannot be negative.",
    expectedReferralsRange: "The clients promised must be between 1 and 500.",
    ownerNeededForFriendRate: "Tie the code to a client before setting what everyone else gets.",
  },
  cooApproval: {
    waiting: "Waiting for the CEO to approve",
    liveNow: "Live",
    needsApprovalOn: "The COO's codes wait for your approval.",
    needsApprovalOff: "The COO's codes go live straight away.",
  },
} as const;

// ── The code itself ──────────────────────────────────────────────────────

export const COUPON_CODE_MIN = 3;
export const COUPON_CODE_MAX = 24;

/** What the client typed, as it is stored and compared: upper case, no spaces. */
export function normalizeCouponCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

export function couponCodeIsValid(code: string): boolean {
  return code.length >= COUPON_CODE_MIN && code.length <= COUPON_CODE_MAX && /^[A-Z0-9][A-Z0-9-]*[A-Z0-9]$/.test(code);
}

// ── Validating a coupon someone is creating ──────────────────────────────

export interface CouponDraft {
  code: string;
  percentOff?: number | null;
  amountOffNgn?: number | null;
  friendPercentOff?: number | null;
  ownerClientId?: string | null;
  minOrderNgn?: number | null;
  maxRedemptions?: number | null;
  expiresAt?: Date | null;
  expectedReferrals?: number | null;
}

function wholeNumberIn(n: unknown, lo: number, hi: number): boolean {
  return typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;
}

/** Every problem with a draft at once, so the screen can show them together. */
export function validateCouponDraft(d: CouponDraft, now: Date): string[] {
  const out: string[] = [];
  if (!couponCodeIsValid(normalizeCouponCode(d.code))) out.push(COUPON_TEXT.draft.codeShape);

  const hasPercent = d.percentOff != null;
  const hasAmount = d.amountOffNgn != null;
  if (hasPercent === hasAmount) out.push(COUPON_TEXT.draft.needsOneDiscount);
  if (hasPercent && !wholeNumberIn(d.percentOff, 1, 100)) out.push(COUPON_TEXT.draft.percentRange);
  if (hasAmount && !(typeof d.amountOffNgn === "number" && d.amountOffNgn > 0)) out.push(COUPON_TEXT.draft.amountPositive);

  if (d.friendPercentOff != null) {
    if (!wholeNumberIn(d.friendPercentOff, 1, 100)) out.push(COUPON_TEXT.draft.friendRange);
    if (!d.ownerClientId) out.push(COUPON_TEXT.draft.ownerNeededForFriendRate);
  }
  if (d.maxRedemptions != null && !(Number.isInteger(d.maxRedemptions) && d.maxRedemptions >= 1)) {
    out.push(COUPON_TEXT.draft.maxRedemptions);
  }
  if (d.minOrderNgn != null && d.minOrderNgn < 0) out.push(COUPON_TEXT.draft.minOrderNegative);
  if (d.expiresAt && d.expiresAt.getTime() <= now.getTime()) out.push(COUPON_TEXT.draft.expiryPast);
  if (d.expectedReferrals != null && !wholeNumberIn(d.expectedReferrals, 1, 500)) {
    out.push(COUPON_TEXT.draft.expectedReferralsRange);
  }
  return out;
}

// ── Applying a coupon to one order ───────────────────────────────────────

export type CouponLifecycle = "DRAFT" | "PENDING_APPROVAL" | "ACTIVE" | "REVOKED";

/** The coupon fields pricing needs — the shape the service selects. */
export interface CouponForPricing {
  code: string;
  status: CouponLifecycle;
  percentOff: number | null;
  amountOffNgn: number | null;
  friendPercentOff: number | null;
  ownerClientId: string | null;
  serviceCodes: string[];
  minOrderNgn: number | null;
  expiresAt: Date | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  tagsReferrals: boolean;
}

export type CouponUse =
  | { kind: "discount"; discountAmount: number; isOwner: boolean; tagReferral: boolean }
  | { kind: "tag_only"; discountAmount: 0; isOwner: false; tagReferral: true }
  | { kind: "refused"; reason: string };

/** Whole naira off, never more than the price itself. */
export function discountOf(listPrice: number, percentOff: number | null, amountOffNgn: number | null): number {
  const raw = percentOff != null ? (listPrice * percentOff) / 100 : (amountOffNgn ?? 0);
  return Math.max(0, Math.min(Math.round(listPrice), Math.round(raw)));
}

export function applyCoupon(input: {
  coupon: CouponForPricing;
  listPrice: number;
  serviceCode: string;
  serviceLabel?: string;
  /** The client placing the order — null at public intake before they exist. */
  clientId: string | null;
  now: Date;
  money?: (n: number) => string;
}): CouponUse {
  const { coupon: c, listPrice, serviceCode, clientId, now } = input;
  const money = input.money ?? ((n: number) => `NGN ${Math.round(n).toLocaleString("en-NG")}`);

  if (c.status === "DRAFT") return { kind: "refused", reason: COUPON_TEXT.refused.draft };
  if (c.status === "PENDING_APPROVAL") return { kind: "refused", reason: COUPON_TEXT.refused.pendingApproval };
  if (c.status === "REVOKED") return { kind: "refused", reason: COUPON_TEXT.refused.revoked };
  if (c.expiresAt && c.expiresAt.getTime() <= now.getTime()) {
    return { kind: "refused", reason: COUPON_TEXT.refused.expired };
  }
  if (c.serviceCodes.length > 0 && !c.serviceCodes.includes(serviceCode)) {
    return { kind: "refused", reason: COUPON_TEXT.refused.wrongService(input.serviceLabel || serviceCode) };
  }
  if (c.minOrderNgn != null && listPrice < c.minOrderNgn) {
    return { kind: "refused", reason: COUPON_TEXT.refused.belowMinimum(money(c.minOrderNgn)) };
  }
  if (c.maxRedemptions != null && c.redemptionCount >= c.maxRedemptions) {
    return { kind: "refused", reason: COUPON_TEXT.refused.usedUp };
  }

  // No owner = anyone may use it at the full rate. With an owner, only they get
  // that rate; everyone else gets the friend rate, or just the referral credit.
  const isOwner = c.ownerClientId == null || (clientId != null && c.ownerClientId === clientId);
  if (isOwner) {
    const off = discountOf(listPrice, c.percentOff, c.amountOffNgn);
    if (off <= 0) return { kind: "refused", reason: COUPON_TEXT.refused.nothingToGive };
    return { kind: "discount", discountAmount: off, isOwner: true, tagReferral: false };
  }

  if (c.friendPercentOff != null) {
    const off = discountOf(listPrice, c.friendPercentOff, null);
    if (off > 0) return { kind: "discount", discountAmount: off, isOwner: false, tagReferral: c.tagsReferrals };
  }
  if (c.tagsReferrals) return { kind: "tag_only", discountAmount: 0, isOwner: false, tagReferral: true };
  return { kind: "refused", reason: COUPON_TEXT.refused.notYours };
}

// ── The fundable cap ─────────────────────────────────────────────────────

export interface CapCheck {
  /** Everything owed out of the LIST price: worker, ambassador, Core, executives. */
  obligations: number;
  /** price - obligations: the deepest discount the order can carry itself. */
  maxDiscount: number;
  maxPercent: number;
  /** What the client actually pays. */
  payable: number;
  /** How much of the discount other projects' money would have to fund. */
  shortfall: number;
  ok: boolean;
}

/** What the people on this job are owed, always computed on the list price. */
export function obligationsOnList(legs: ProjectLegs, s: CashflowStructure): number {
  if (legs.isProBono) return 0;
  const people = personLegs(legs, s).reduce((sum, l) => sum + l.amount, 0);
  return Math.round(workerLeg(legs, s) + (legs.ambassadorCommission ?? 0) + (legs.parentCommission ?? 0) + people);
}

/**
 * Whether a discount of this size can be paid for out of the job itself. A
 * direct order owes less out than a referred one (no ambassador, no HOG leg),
 * so it can carry a deeper discount — the figures come from the published
 * structure, never from a number typed here.
 */
export function capCheck(legs: ProjectLegs, discountAmount: number, s: CashflowStructure): CapCheck {
  const price = Math.round(legs.price);
  const obligations = obligationsOnList(legs, s);
  const maxDiscount = Math.max(0, price - obligations);
  const payable = Math.max(0, price - Math.round(discountAmount));
  const shortfall = Math.max(0, obligations - payable);
  return {
    obligations,
    maxDiscount,
    maxPercent: price > 0 ? Math.floor((maxDiscount / price) * 100) : 0,
    payable,
    shortfall,
    ok: shortfall === 0,
  };
}

/**
 * The timing trap on a referred job: the ambassador's share and the HOG's are
 * owed the moment the downpayment is confirmed, and a discount shrinks the
 * downpayment while those legs stay on the list price. Never a refusal — the
 * money evens out over the full payment — but the founder should see it.
 */
export function downpaymentCover(
  legs: ProjectLegs,
  discountAmount: number,
  downpaymentPercent: number,
  s: CashflowStructure
): { owedAtDownpayment: number; downpayment: number; ok: boolean; short: number } {
  const payable = Math.max(0, Math.round(legs.price) - Math.round(discountAmount));
  const downpayment = Math.round((payable * downpaymentPercent) / 100);
  const ambassadorRow = s.level1.find((r) => r.kind === "person" && r.recipients === "ambassadors");
  const ambassadorAtDownpayment =
    ambassadorRow?.trigger === "downpayment" ? (legs.ambassadorCommission ?? 0) + (legs.parentCommission ?? 0) : 0;
  const peopleAtDownpayment = personLegs(legs, s)
    .filter((l) => l.trigger === "downpayment")
    .reduce((sum, l) => sum + l.amount, 0);
  const owedAtDownpayment = Math.round(ambassadorAtDownpayment + peopleAtDownpayment);
  return {
    owedAtDownpayment,
    downpayment,
    ok: owedAtDownpayment <= downpayment,
    short: Math.max(0, owedAtDownpayment - downpayment),
  };
}

// ── Display ──────────────────────────────────────────────────────────────

/** "50%" for a round percentage of the price, else the naira figure. */
export function discountLabel(listPrice: number, discountAmount: number, money: (n: number) => string): string {
  if (listPrice > 0) {
    const pct = (discountAmount / listPrice) * 100;
    if (Math.abs(pct - Math.round(pct)) < 0.01) return `${Math.round(pct)}%`;
  }
  return money(discountAmount);
}

export function referralProgressLine(expected: number | null, delivered: number): string {
  if (expected == null) return delivered === 1 ? "1 client brought in" : `${delivered} clients brought in`;
  return `${delivered} of ${expected} clients brought in`;
}

/**
 * The deepest discount a coupon can carry before any order exists, as a
 * percentage of the price: a direct order owes less out than a referred one, so
 * it can go deeper. Read straight off the published structure's own rows.
 */
export function couponCeilings(s: CashflowStructure): { directMaxPercent: number; referredMaxPercent: number } {
  let direct = 0;
  let referred = 0;
  for (const row of s.level1) {
    if (row.kind !== "person" || !isActiveRow(row)) continue;
    // A row that pays one named person pays nothing until someone is named.
    if (row.recipients === "user" && !row.assignedUserId) continue;
    const onlyWhenReferred = row.recipients === "ambassadors" || row.condition === "ambassador_driven";
    referred += row.percentage;
    if (!onlyWhenReferred) direct += row.percentage;
  }
  return {
    directMaxPercent: Math.max(0, Math.floor(100 - direct)),
    referredMaxPercent: Math.max(0, Math.floor(100 - referred)),
  };
}
