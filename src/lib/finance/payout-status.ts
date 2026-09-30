import type { PersonTrigger } from "@/lib/finance/cashflow-types";

/**
 * The commission state machine (Phase 3).
 *
 * A PayoutRecord moves through:
 *
 *   (created) ─▶ ACCRUED ─▶ PAID        (marked paid / a payout batch in Phase 5)
 *                   │
 *                   ├──▶ CANCELLED      (the leg is no longer produced — the ambassador
 *                   │                    was removed, the project was cancelled/refunded,
 *                   │                    the rate changed to zero; reversible: a leg owed
 *                   │                    again revives CANCELLED ─▶ ACCRUED)
 *                   │
 *                   └──▶ REVERSED       (undone by a refund, with a reason the recipient
 *                                        sees; final, never revived — produced in Phase 6)
 *
 * `PENDING` is the pre-Phase-3 name for "owed, unpaid": the data migration turns
 * every PENDING row into ACCRUED and no new code writes it, but reads still
 * tolerate it so a row that slips through (an old default, a replay mid-deploy)
 * is never lost.
 *
 * This module is the single source of truth for which statuses count where; the
 * engine and `npm run check:payouts` both import it, and the finance readers use
 * the `IN` helpers so a new status can never be silently mis-filed.
 */

export type PayoutStatus = "PENDING" | "ACCRUED" | "PAID" | "REVERSED" | "CANCELLED";

/** The state a freshly produced leg is created in (unless it was already paid before the engine). */
export const CREATE_STATUS = "ACCRUED" as const;

/**
 * Counts toward what a recipient is owed or has earned (month totals, lifetime
 * earnings, the finance figures). Everything except the two "gone" states.
 * CANCELLED = the leg was never really owed; REVERSED = a refund took it back.
 */
export const OWED_STATUSES: readonly PayoutStatus[] = ["PENDING", "ACCRUED", "PAID"];

/** Owed but not yet paid — what the payout queue can pay and "Needs attention" counts. */
export const UNPAID_STATUSES: readonly PayoutStatus[] = ["PENDING", "ACCRUED"];

/** Paid out. */
export const PAID_STATUSES: readonly PayoutStatus[] = ["PAID"];

/** Reconcile never touches these — they are settled (money out, or a refund's reversal). */
export const SETTLED_STATUSES: readonly PayoutStatus[] = ["PAID", "REVERSED"];

/** Reconcile cancels one of these when its leg stops being produced on a live project. */
export const CANCELLABLE_STATUSES: readonly PayoutStatus[] = ["PENDING", "ACCRUED"];

/** Prisma `status: { notIn: [...] }` for an "owed / earned" read. */
export const NOT_OWED = ["CANCELLED", "REVERSED"] as const;

export function isOwed(status: string): boolean {
  return (OWED_STATUSES as readonly string[]).includes(status);
}
export function isUnpaid(status: string): boolean {
  return (UNPAID_STATUSES as readonly string[]).includes(status);
}
export function isPaid(status: string): boolean {
  return (PAID_STATUSES as readonly string[]).includes(status);
}
export function isSettled(status: string): boolean {
  return (SETTLED_STATUSES as readonly string[]).includes(status);
}
export function isCancellable(status: string): boolean {
  return (CANCELLABLE_STATUSES as readonly string[]).includes(status);
}

/** What has fired for a project, from its own money state (pure). */
export interface TriggerState {
  alive: boolean;
  downpaymentVerified: boolean;
  balanceVerified: boolean;
  completed: boolean;
}

/** Whether a leg with the given trigger is owed now. */
export function triggerFired(trigger: PersonTrigger, state: TriggerState): boolean {
  if (!state.alive) return false;
  if (trigger === "downpayment") return state.downpaymentVerified;
  if (trigger === "full_payment") return state.balanceVerified || state.completed;
  return state.completed; // "completion"
}

export type ReconcileAction = "create" | "update" | "keep" | "cancel" | "skip";

/**
 * What reconcile does to one existing row (or the absence of one) given whether
 * its leg is produced now and whether its figures changed. Pure — the engine
 * performs the write, this decides it, and the check proves the table.
 */
export function reconcileAction(input: { existingStatus: PayoutStatus | null; produced: boolean; changed: boolean }): ReconcileAction {
  const { existingStatus, produced, changed } = input;
  if (existingStatus == null) return produced ? "create" : "skip";
  // A settled row (paid, or reversed by a refund) is immutable.
  if (isSettled(existingStatus)) return "skip";
  if (produced) {
    // A cancelled leg that is owed again, or a figure that moved, is rewritten to ACCRUED.
    if (existingStatus === "CANCELLED" || changed) return "update";
    return "keep";
  }
  // No longer produced: cancel an owed row, leave anything else.
  return isCancellable(existingStatus) ? "cancel" : "skip";
}

/** The trigger a row was produced by, stored for audit and for the executive/portal reads. */
export function triggerEventKey(trigger: PersonTrigger): PersonTrigger {
  return trigger;
}
