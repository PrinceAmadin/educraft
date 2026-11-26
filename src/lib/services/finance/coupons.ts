/**
 * Coupon codes — the CEO's (and, when he allows it, the COO's) discounts.
 *
 * The rules live in `src/lib/finance/coupon-rules.ts` and are proved by
 * `npm run check:coupons`; this file is the database side of them. The founder's
 * rule: everyone on the job is paid their normal share of the LIST price, and
 * EduCraft's retained share carries the discount alone. A discount deeper than
 * the job can fund out of its own price is refused unless the coupon carries the
 * CEO's own override, with his reason on the record.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  applyCoupon,
  capCheck,
  couponCeilings,
  COUPON_TEXT,
  discountLabel,
  downpaymentCover,
  normalizeCouponCode,
  validateCouponDraft,
  type CouponForPricing,
  type CouponUse,
} from "@/lib/finance/coupon-rules";
import { ratePercentForTier, type ProjectLegs } from "@/lib/finance/commission-config";
import { getActiveCashflow } from "@/lib/services/cashflow";
import { notifyRole } from "@/lib/services/notifications";
import { resolveParentCommission } from "@/lib/services/ambassador-commission";
import { commissionFor } from "@/lib/commission";

export const COUPON_APPROVAL_KEY = "coupon_coo_needs_approval";

export class CouponError extends Error {
  status: number;
  problems?: string[];
  constructor(message: string, status = 400, problems?: string[]) {
    super(message);
    this.name = "CouponError";
    this.status = status;
    this.problems = problems;
  }
}

const ngn = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

export interface CouponActor {
  userId: string;
  role: string;
  name?: string | null;
}

const isFounder = (actor: CouponActor) => actor.role === "SUPER_ADMIN";

/** The fields `applyCoupon` needs, and nothing more. */
const PRICING_SELECT = {
  id: true,
  code: true,
  status: true,
  percentOff: true,
  amountOffNgn: true,
  friendPercentOff: true,
  ownerClientId: true,
  serviceCodes: true,
  minOrderNgn: true,
  expiresAt: true,
  maxRedemptions: true,
  redemptionCount: true,
  tagsReferrals: true,
  overrideCap: true,
} satisfies Prisma.CouponSelect;

// ── The approval switch ──────────────────────────────────────────────────

/** Whether a COO-created coupon waits for the CEO. Defaults to yes. */
export async function cooNeedsApproval(): Promise<boolean> {
  const row = await db.setting.findUnique({ where: { key: COUPON_APPROVAL_KEY } });
  return row?.value !== "false";
}

/** The CEO's toggle. Turning it off lets the COO's codes go live at once. */
export async function setCooApproval(on: boolean, actor: CouponActor): Promise<void> {
  if (!isFounder(actor)) throw new CouponError(COUPON_TEXT.cap.founderOnly, 403);
  const before = await cooNeedsApproval();
  if (before === on) return;
  await db.$transaction(async (tx) => {
    await tx.setting.upsert({
      where: { key: COUPON_APPROVAL_KEY },
      create: { key: COUPON_APPROVAL_KEY, value: on ? "true" : "false" },
      update: { value: on ? "true" : "false" },
    });
    await tx.cashflowAuditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "changed_coupon_approval",
        entityType: "Setting",
        entityId: COUPON_APPROVAL_KEY,
        afterJson: { cooNeedsApproval: on } as unknown as Prisma.InputJsonValue,
        reason: on ? COUPON_TEXT.cooApproval.needsApprovalOn : COUPON_TEXT.cooApproval.needsApprovalOff,
      },
    });
  });
}

// ── Creating one ─────────────────────────────────────────────────────────

export interface CreateCouponInput {
  code: string;
  label?: string | null;
  percentOff?: number | null;
  amountOffNgn?: number | null;
  friendPercentOff?: number | null;
  ownerClientId?: string | null;
  serviceCodes?: string[];
  minOrderNgn?: number | null;
  expiresAt?: Date | null;
  maxRedemptions?: number | null;
  expectedReferrals?: number | null;
  tagsReferrals?: boolean;
  note?: string | null;
  /** SUPER_ADMIN only: let this code go deeper than an order can fund. */
  overrideCap?: boolean;
  overrideReason?: string | null;
}

export async function createCoupon(input: CreateCouponInput, actor: CouponActor) {
  const code = normalizeCouponCode(input.code);
  const now = new Date();
  const problems = validateCouponDraft({ ...input, code, ownerClientId: input.ownerClientId ?? null }, now);
  if (problems.length) throw new CouponError(problems[0], 400, problems);

  // The founder knows a client as ECC-0042, not as an internal id, so either
  // is accepted and the code is tied to the row it finds.
  let ownerClientId: string | null = null;
  if (input.ownerClientId) {
    const typed = input.ownerClientId.trim();
    const owner = await db.client.findFirst({
      where: { OR: [{ id: typed }, { clientId: { equals: typed, mode: "insensitive" } }] },
      select: { id: true },
    });
    if (!owner) throw new CouponError("We don't have a client with that ID", 400);
    ownerClientId = owner.id;
  }

  const taken = await db.coupon.findUnique({ where: { code }, select: { id: true } });
  if (taken) throw new CouponError("That code is already in use", 409);

  // A percentage deeper than ANY order can fund needs the CEO's override.
  const { structure } = await getActiveCashflow();
  const ceilings = couponCeilings(structure);
  const wantsOverride = input.overrideCap === true;
  const overCeiling = input.percentOff != null && input.percentOff > ceilings.directMaxPercent;
  if (overCeiling && !wantsOverride) {
    throw new CouponError(
      COUPON_TEXT.cap.overCap(`${ceilings.directMaxPercent}%`, "the rest"),
      400
    );
  }
  if (wantsOverride && !isFounder(actor)) throw new CouponError(COUPON_TEXT.cap.founderOnly, 403);
  if (wantsOverride && !(input.overrideReason || "").trim()) {
    throw new CouponError(COUPON_TEXT.cap.overrideNeedsReason, 400);
  }

  const needsApproval = !isFounder(actor) && (await cooNeedsApproval());
  const status = needsApproval ? "PENDING_APPROVAL" : "ACTIVE";

  const coupon = await db.$transaction(async (tx) => {
    const created = await tx.coupon.create({
      data: {
        code,
        label: input.label?.trim() || null,
        percentOff: input.percentOff ?? null,
        amountOffNgn: input.amountOffNgn ?? null,
        friendPercentOff: input.friendPercentOff ?? null,
        ownerClientId,
        serviceCodes: input.serviceCodes ?? [],
        minOrderNgn: input.minOrderNgn ?? null,
        expiresAt: input.expiresAt ?? null,
        maxRedemptions: input.maxRedemptions ?? null,
        expectedReferrals: input.expectedReferrals ?? null,
        tagsReferrals: input.tagsReferrals ?? true,
        note: input.note?.trim() || null,
        status,
        createdById: actor.userId,
        createdByRole: actor.role,
        approvedById: status === "ACTIVE" ? actor.userId : null,
        approvedAt: status === "ACTIVE" ? now : null,
        overrideCap: wantsOverride,
        overrideReason: wantsOverride ? (input.overrideReason || "").trim() : null,
      },
      select: { id: true, code: true, status: true },
    });
    await tx.cashflowAuditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "created_coupon",
        entityType: "Coupon",
        entityId: created.id,
        afterJson: {
          code,
          percentOff: input.percentOff ?? null,
          amountOffNgn: input.amountOffNgn ?? null,
          status,
          overrideCap: wantsOverride,
        } as unknown as Prisma.InputJsonValue,
        reason: input.overrideReason?.trim() || input.label?.trim() || null,
      },
    });
    return created;
  });

  if (status === "PENDING_APPROVAL") {
    await notifyRole("SUPER_ADMIN", {
      title: "A coupon code needs your approval",
      message: `${actor.name || "The COO"} created ${code}. It gives nothing away until you approve it.`,
      link: "/admin/coupons",
    });
  }
  return coupon;
}

// ── Approving, refusing, withdrawing ─────────────────────────────────────

export async function decideCoupon(
  couponId: string,
  decision: "approve" | "reject",
  actor: CouponActor,
  note?: string | null
) {
  if (!isFounder(actor)) throw new CouponError("Only the CEO decides a coupon", 403);
  const coupon = await db.coupon.findUnique({
    where: { id: couponId },
    select: { id: true, code: true, status: true, createdById: true },
  });
  if (!coupon) throw new CouponError("That code no longer exists", 404);
  if (coupon.status !== "PENDING_APPROVAL") throw new CouponError("That code is not waiting for a decision", 409);

  const status = decision === "approve" ? "ACTIVE" : "REVOKED";
  // Claimed, so two clicks cannot both decide it.
  const claimed = await db.coupon.updateMany({
    where: { id: couponId, status: "PENDING_APPROVAL" },
    data: {
      status,
      approvedById: actor.userId,
      approvedAt: new Date(),
      decisionNote: note?.trim() || null,
      ...(decision === "reject" ? { revokedAt: new Date(), revokedById: actor.userId } : {}),
    },
  });
  if (claimed.count !== 1) throw new CouponError("That code was just decided by someone else", 409);

  await db.cashflowAuditLog.create({
    data: {
      actorUserId: actor.userId,
      action: decision === "approve" ? "approved_coupon" : "rejected_coupon",
      entityType: "Coupon",
      entityId: couponId,
      afterJson: { code: coupon.code, status } as unknown as Prisma.InputJsonValue,
      reason: note?.trim() || null,
    },
  });
  await notifyRole("COO", {
    title: decision === "approve" ? `Coupon ${coupon.code} is live` : `Coupon ${coupon.code} was not approved`,
    message: note?.trim() || (decision === "approve" ? "Clients can use it now." : "It gives nothing away."),
    link: "/admin/coupons",
  });
  return { id: couponId, status };
}

/** Withdraw a live code. Orders already placed keep the discount they were given. */
export async function revokeCoupon(couponId: string, actor: CouponActor, reason?: string | null) {
  const coupon = await db.coupon.findUnique({ where: { id: couponId }, select: { code: true, status: true } });
  if (!coupon) throw new CouponError("That code no longer exists", 404);
  if (coupon.status === "REVOKED") return { id: couponId, status: "REVOKED" as const };
  await db.coupon.update({
    where: { id: couponId },
    data: { status: "REVOKED", revokedAt: new Date(), revokedById: actor.userId, decisionNote: reason?.trim() || null },
  });
  await db.cashflowAuditLog.create({
    data: {
      actorUserId: actor.userId,
      action: "revoked_coupon",
      entityType: "Coupon",
      entityId: couponId,
      afterJson: { code: coupon.code } as unknown as Prisma.InputJsonValue,
      reason: reason?.trim() || null,
    },
  });
  return { id: couponId, status: "REVOKED" as const };
}

// ── Using one on an order ────────────────────────────────────────────────

export interface ResolvedCoupon {
  couponId: string;
  code: string;
  /** What comes off this client's bill (0 when the code only tags a referral). */
  discountAmount: number;
  /** Set when someone else's code brought this client in. */
  broughtByCouponId: string | null;
  message: string;
}

/**
 * Judge a typed code against one order. `legs` is the project as it WILL be —
 * the list price with its worker, ambassador and executive legs — so the cap is
 * measured against the real obligations, not a guess.
 *
 * `audience` shapes the refusal: a client is never shown EduCraft's own maths.
 */
export async function resolveCouponForOrder(input: {
  code: string;
  serviceCode: string;
  serviceLabel?: string;
  legs: ProjectLegs;
  clientId: string | null;
  audience: "client" | "staff";
  now?: Date;
}): Promise<ResolvedCoupon> {
  const code = normalizeCouponCode(input.code);
  if (!code) throw new CouponError(COUPON_TEXT.refused.unknown, 400);
  const row = await db.coupon.findUnique({ where: { code }, select: PRICING_SELECT });
  if (!row) throw new CouponError(COUPON_TEXT.refused.unknown, 400);

  const now = input.now ?? new Date();
  const use: CouponUse = applyCoupon({
    coupon: row as unknown as CouponForPricing,
    listPrice: input.legs.price,
    serviceCode: input.serviceCode,
    serviceLabel: input.serviceLabel,
    clientId: input.clientId,
    now,
    money: ngn,
  });
  if (use.kind === "refused") throw new CouponError(use.reason, 400);

  if (use.kind === "tag_only") {
    return {
      couponId: row.id,
      code: row.code,
      discountAmount: 0,
      broughtByCouponId: row.id,
      message: COUPON_TEXT.applied.tagOnly,
    };
  }

  // The arithmetic line. Only a coupon carrying the CEO's override may cross it.
  const { structure } = await getActiveCashflow();
  const cap = capCheck(input.legs, use.discountAmount, structure);
  if (!cap.ok && !row.overrideCap) {
    throw new CouponError(
      input.audience === "staff"
        ? COUPON_TEXT.cap.overCap(ngn(cap.maxDiscount), ngn(cap.shortfall))
        : COUPON_TEXT.refused.wrongService(input.serviceLabel || "this order"),
      400
    );
  }

  return {
    couponId: row.id,
    code: row.code,
    discountAmount: use.discountAmount,
    broughtByCouponId: use.tagReferral ? row.id : null,
    message: use.isOwner
      ? COUPON_TEXT.applied.owner(discountLabel(input.legs.price, use.discountAmount, ngn))
      : COUPON_TEXT.applied.friend(discountLabel(input.legs.price, use.discountAmount, ngn)),
  };
}

/**
 * Record the use, inside the transaction that creates the project. A code used
 * past its limit by a race is HONOURED — the client has already paid what they
 * were billed — and flagged for finance instead.
 */
export async function redeemCouponTx(
  tx: Prisma.TransactionClient,
  input: { couponId: string; projectId: string; clientId: string; listPrice: number; discountAmount: number }
): Promise<{ overLimit: boolean }> {
  const coupon = await tx.coupon.findUnique({
    where: { id: input.couponId },
    select: { maxRedemptions: true, redemptionCount: true },
  });
  const overLimit =
    !!coupon?.maxRedemptions && coupon.redemptionCount >= coupon.maxRedemptions;

  await tx.coupon.update({ where: { id: input.couponId }, data: { redemptionCount: { increment: 1 } } });
  await tx.couponRedemption.create({
    data: {
      couponId: input.couponId,
      projectId: input.projectId,
      clientId: input.clientId,
      listPrice: input.listPrice,
      discountAmount: input.discountAmount,
      payablePrice: Math.max(0, input.listPrice - input.discountAmount),
      overLimit,
    },
  });
  return { overLimit };
}

// ── Reading them ─────────────────────────────────────────────────────────

export async function listCoupons() {
  const [rows, { structure }, needsApproval] = await Promise.all([
    db.coupon.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: {
        id: true, code: true, label: true, percentOff: true, amountOffNgn: true, friendPercentOff: true,
        serviceCodes: true, minOrderNgn: true, expiresAt: true, maxRedemptions: true, redemptionCount: true,
        expectedReferrals: true, tagsReferrals: true, note: true, status: true, createdByRole: true,
        createdAt: true, overrideCap: true, overrideReason: true, decisionNote: true,
        owner: { select: { id: true, clientId: true, fullName: true } },
        redemptions: { select: { discountAmount: true } },
        _count: { select: { broughtIn: true } },
      },
    }),
    getActiveCashflow(),
    cooNeedsApproval(),
  ]);

  return {
    cooNeedsApproval: needsApproval,
    ceilings: couponCeilings(structure),
    coupons: rows.map((c) => ({
      ...c,
      redemptions: undefined,
      timesUsed: c.redemptions.length,
      discountGiven: c.redemptions.reduce((sum, r) => sum + r.discountAmount, 0),
      broughtIn: c._count.broughtIn,
    })),
  };
}

/** What a code would do to one order, for the staff screen. */
export async function previewCoupon(input: {
  code: string;
  serviceCode: string;
  legs: ProjectLegs;
  clientId: string | null;
}) {
  const { structure } = await getActiveCashflow();
  try {
    const resolved = await resolveCouponForOrder({ ...input, audience: "staff" });
    const cap = capCheck(input.legs, resolved.discountAmount, structure);
    const timing = downpaymentCover(
      input.legs,
      resolved.discountAmount,
      structure.triggers.downpaymentPercent,
      structure
    );
    return {
      ok: true as const,
      ...resolved,
      payable: cap.payable,
      obligations: cap.obligations,
      retained: Math.max(0, cap.payable - cap.obligations),
      maxDiscount: cap.maxDiscount,
      withinCap: cap.ok,
      shortfall: cap.shortfall,
      downpaymentWarning: timing.ok
        ? null
        : COUPON_TEXT.cap.downpaymentTight(ngn(timing.owedAtDownpayment), ngn(timing.downpayment)),
    };
  } catch (error) {
    if (error instanceof CouponError) return { ok: false as const, reason: error.message };
    throw error;
  }
}

/**
 * The legs a public order WILL owe, worked out before the project exists, so a
 * coupon's cap is measured against the real obligations at the moment the
 * client is charged. Mirrors what `submitIntake` freezes on the project: the
 * worker's share from the structure, the referrer's tier rate, and the Core's
 * override when the referrer is a Sub.
 */
export async function prospectiveLegs(input: {
  listPrice: number;
  referralCode?: string | null;
}): Promise<ProjectLegs> {
  const { structure } = await getActiveCashflow();
  const code = input.referralCode?.trim();
  if (!code) {
    return {
      price: input.listPrice,
      workerPayout: null,
      ambassadorCommission: null,
      parentCommission: null,
      ambassadorId: null,
    };
  }
  const ambassador = await db.ambassador.findUnique({
    where: { referralCode: code },
    select: { id: true, tier: true, status: true },
  });
  if (!ambassador || ambassador.status === "Suspended" || ambassador.status === "Terminated") {
    return {
      price: input.listPrice,
      workerPayout: null,
      ambassadorCommission: null,
      parentCommission: null,
      ambassadorId: null,
    };
  }
  const rate = ratePercentForTier(ambassador.tier, structure.tiers);
  const parent = await resolveParentCommission(ambassador.id, rate ?? 0);
  return {
    price: input.listPrice,
    workerPayout: null,
    ambassadorCommission: commissionFor(input.listPrice, rate),
    parentCommission: parent ? commissionFor(input.listPrice, parent.rate) : null,
    ambassadorId: ambassador.id,
  };
}
