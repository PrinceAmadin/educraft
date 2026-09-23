import type { ProjectStatus } from "@prisma/client";

/**
 * When a client may pay the 55% balance through Paystack.
 *
 * EduCraft releases Chapters 1-2 on the downpayment and everything after them
 * on the balance, so a client often pays the balance while work is still in
 * progress, not only after the quality check. Any working status counts once
 * the downpayment is verified. If the balance lands before QA approval, the
 * project simply skips the balance step when it reaches APPROVED (see
 * transitionProject). Pure: shared by the payment service and the client pages.
 */
export const BALANCE_PAYABLE_STATUSES: readonly ProjectStatus[] = [
  "DOWNPAYMENT_VERIFIED",
  "REQUIREMENTS_CONFIRMED",
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_CLIENT_INPUT",
  "SUBMITTED",
  "IN_QA_REVIEW",
  "REVISION_NEEDED",
  "APPROVED",
  "ON_HOLD",
];

export interface PayableProject {
  status: ProjectStatus;
  isProBono: boolean;
  downpaymentStatus: string;
  downpaymentAmount: number;
  balanceStatus: string;
  balanceAmount: number;
}

/** The downpayment is due: a new order that has not been paid yet. */
export function downpaymentDue(p: PayableProject): boolean {
  return !p.isProBono && p.status === "NEW" && p.downpaymentStatus !== "Verified" && p.downpaymentAmount > 0;
}

/** The balance can be paid now (it is always owed until verified; this says whether Paystack will take it). */
export function balancePayable(p: PayableProject): boolean {
  return (
    !p.isProBono &&
    p.downpaymentStatus === "Verified" &&
    p.balanceStatus !== "Verified" &&
    p.balanceAmount > 0 &&
    BALANCE_PAYABLE_STATUSES.includes(p.status)
  );
}
