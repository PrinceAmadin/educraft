/**
 * The Paystack reconciliation row and its status vocabulary. Pure, so the
 * client-side table can import it without dragging the server-only payment
 * service (mailer, web push) into the browser bundle.
 */
export interface ReconciliationRow {
  reference: string;
  projectCode: string | null;
  amount: number; // naira, Paystack gross confirmed amount
  channel: string | null;
  paidAt: string | null;
  /** Duplicate (a second charge held for refund), Reversed and Rejected are settled: nothing to sync. */
  ourStatus: "Confirmed" | "Duplicate" | "Reversed" | "Rejected" | "Pending" | "Failed" | "Missing";
}

/** Local statuses that mean the Paystack record is fully accounted for on our side. */
export const RECONCILED_STATUSES: ReadonlySet<ReconciliationRow["ourStatus"]> = new Set(["Confirmed", "Duplicate", "Reversed", "Rejected"]);

export function isReconciled(status: ReconciliationRow["ourStatus"]): boolean {
  return RECONCILED_STATUSES.has(status);
}
