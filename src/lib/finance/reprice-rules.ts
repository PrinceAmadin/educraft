/**
 * Repricing a project — the money model (pure, no DB).
 *
 * When EduCraft corrects a project's service or price after the client has
 * already paid, the money already received is re-applied against the new
 * price. Payments are immutable facts; `price` is the target. An overpaid
 * downpayment overflows into (reduces) the balance still owed, never lost.
 *
 * The same functions run on the server (authoritative), in the reprice dialog
 * (live preview) and in `check:reprice` (unit math), so what is shown is what
 * is written. Only `commissionFor` is imported, which has no server deps.
 */

import { commissionFor } from "@/lib/commission";

// ── Client payment legs ────────────────────────────────────────────────────

export interface ReconcileLegsInput {
  newPrice: number;
  /** Confirmed client inflows less confirmed refunds (projectNetInflow). */
  moneyIn: number;
  /** downpaymentStatus === "Verified" */
  downpaymentVerified: boolean;
  /** balanceStatus === "Verified" */
  balanceVerified: boolean;
  /** Service.downpaymentPercentage (45 by default). */
  downpaymentPercentage: number;
  /** The leg amount already recorded for the downpayment (kept as history once verified). */
  currentDownpaymentAmount: number;
}

export interface ReconciledLegs {
  downpaymentAmount: number;
  /** The target downpayment status, or null to leave it unchanged. */
  downpaymentStatus: "Unpaid" | null;
  balanceAmount: number;
  /** The target balance status. */
  balanceStatus: "Unpaid" | "Verified";
  /** Clear the balance reference/date — a previously-verified balance is being re-opened. */
  clearBalanceReference: boolean;
  /** What the client still owes (≥ 0). */
  remaining: number;
  /** Money in beyond the new price (≥ 0) — flagged to finance for a refund. */
  overpayment: number;
  /** A fully-paid balance was re-opened because the new price rose above money in. */
  balanceReopened: boolean;
}

/**
 * Re-apply the money already in onto the new price.
 *
 * - Downpayment not yet verified ⇒ a fresh split on the new price (as at creation).
 * - Downpayment verified ⇒ keep it as the record of the first payment; the
 *   balance becomes whatever is still owed (new price − money in). An overpaid
 *   downpayment therefore shrinks the balance automatically. If money in now
 *   covers (or exceeds) the new price, the balance is cleared and any excess is
 *   surfaced as an overpayment.
 */
export function reconcileClientLegs(input: ReconcileLegsInput): ReconciledLegs {
  const { newPrice, moneyIn, downpaymentVerified, balanceVerified, downpaymentPercentage } = input;

  if (!downpaymentVerified) {
    const downpaymentAmount = Math.round((newPrice * downpaymentPercentage) / 100);
    return {
      downpaymentAmount,
      downpaymentStatus: null,
      balanceAmount: newPrice - downpaymentAmount,
      balanceStatus: "Unpaid",
      clearBalanceReference: false,
      remaining: Math.max(0, newPrice - moneyIn),
      overpayment: Math.max(0, moneyIn - newPrice),
      balanceReopened: false,
    };
  }

  const remaining = newPrice - moneyIn;
  if (remaining > 0) {
    return {
      downpaymentAmount: input.currentDownpaymentAmount,
      downpaymentStatus: null,
      balanceAmount: remaining,
      balanceStatus: "Unpaid",
      clearBalanceReference: balanceVerified,
      remaining,
      overpayment: 0,
      balanceReopened: balanceVerified,
    };
  }

  // Money in covers the whole new price — the project is fully paid.
  return {
    downpaymentAmount: input.currentDownpaymentAmount,
    downpaymentStatus: null,
    balanceAmount: 0,
    balanceStatus: "Verified",
    clearBalanceReference: false,
    remaining: 0,
    overpayment: moneyIn - newPrice,
    balanceReopened: false,
  };
}

// ── Payout snapshot legs (worker / ambassador / parent) ──────────────────────

export interface ReconcileSnapshotsInput {
  newPrice: number;
  workerPayoutRate: number;
  workerPayoutPaid: boolean;
  currentWorkerPayout: number | null;
  ambassadorId: string | null;
  ambassadorCommRate: number | null;
  ambassadorCommPaid: boolean;
  currentAmbassadorCommission: number | null;
  parentAmbassadorId: string | null;
  parentCommRate: number | null;
  parentCommPaid: boolean;
  currentParentCommission: number | null;
}

export interface Recovery {
  recipient: "worker" | "ambassador" | "parent";
  /** What was already paid out at the old price. */
  paid: number;
  /** What the leg should be at the new price. */
  shouldBe: number;
  /** paid − shouldBe: positive = recover from them, negative = they are owed more. */
  delta: number;
}

export interface ReconciledSnapshots {
  workerPayout: number;
  ambassadorCommission: number | null;
  parentCommission: number | null;
  educraftRevenue: number;
  /** Already-paid legs whose amount no longer matches the new price — settled by hand. */
  recoveries: Recovery[];
}

/**
 * Recompute the frozen payout snapshots from the new price. A leg that has NOT
 * been paid is re-trued to the new price (the ACCRUED payout record follows via
 * reconcileProjectPayouts). A leg already PAID is left at what was actually
 * paid — the ledger stays honest — and the difference is surfaced as a manual
 * recovery, exactly as a refund handles an already-paid commission.
 */
export function reconcileSnapshots(input: ReconcileSnapshotsInput): ReconciledSnapshots {
  const recoveries: Recovery[] = [];

  const workerTarget = Math.round((input.newPrice * (input.workerPayoutRate || 40)) / 100);
  let workerPayout = workerTarget;
  if (input.workerPayoutPaid && input.currentWorkerPayout != null) {
    workerPayout = input.currentWorkerPayout;
    if (input.currentWorkerPayout !== workerTarget) {
      recoveries.push({ recipient: "worker", paid: input.currentWorkerPayout, shouldBe: workerTarget, delta: input.currentWorkerPayout - workerTarget });
    }
  }

  let ambassadorCommission: number | null = null;
  if (input.ambassadorId && input.ambassadorCommRate != null) {
    const target = commissionFor(input.newPrice, input.ambassadorCommRate);
    if (input.ambassadorCommPaid && input.currentAmbassadorCommission != null) {
      ambassadorCommission = input.currentAmbassadorCommission;
      if (input.currentAmbassadorCommission !== target) {
        recoveries.push({ recipient: "ambassador", paid: input.currentAmbassadorCommission, shouldBe: target, delta: input.currentAmbassadorCommission - target });
      }
    } else {
      ambassadorCommission = target;
    }
  }

  let parentCommission: number | null = null;
  if (input.parentAmbassadorId && input.parentCommRate != null) {
    const target = commissionFor(input.newPrice, input.parentCommRate);
    if (input.parentCommPaid && input.currentParentCommission != null) {
      parentCommission = input.currentParentCommission;
      if (input.currentParentCommission !== target) {
        recoveries.push({ recipient: "parent", paid: input.currentParentCommission, shouldBe: target, delta: input.currentParentCommission - target });
      }
    } else {
      parentCommission = target;
    }
  }

  const educraftRevenue = input.newPrice - workerPayout - (ambassadorCommission ?? 0) - (parentCommission ?? 0);
  return { workerPayout, ambassadorCommission, parentCommission, educraftRevenue, recoveries };
}
