import type { ProjectStatus } from "@prisma/client";
import { deadlineInfo } from "@/lib/utils";
import { clockPause, liveDeadline, type ClockPause } from "@/lib/pause-clock";

/**
 * Pure display helpers shared by server and client components — no Prisma,
 * no DB. Everything here takes plain fields, not model instances.
 */

export type PaymentStanding = "Unpaid" | "Partial" | "Paid";

export function paymentStanding(input: {
  downpaymentStatus: string;
  balanceStatus: string;
}): PaymentStanding {
  if (input.balanceStatus === "Verified") return "Paid";
  if (input.downpaymentStatus === "Paid" || input.downpaymentStatus === "Verified") {
    return "Partial";
  }
  return "Unpaid";
}

export function paymentStandingLabel(input: {
  downpaymentStatus: string;
  balanceStatus: string;
  isProBono?: boolean;
}): string {
  if (input.isProBono) return "Pro bono";
  const standing = paymentStanding(input);
  if (standing === "Paid") return "Paid in full";
  if (standing === "Partial") {
    return input.downpaymentStatus === "Verified" ? "45% verified" : "45% paid";
  }
  return "Unpaid";
}

export const PAYMENT_BADGE: Record<PaymentStanding, string> = {
  Unpaid: "border-transparent bg-elevated text-muted-foreground",
  Partial: "border-transparent bg-gold/15 text-gold",
  Paid: "border-transparent bg-success/15 text-success",
};

export type RowAccent = "none" | "ok" | "soon" | "risk" | "waiting" | "done";

/**
 * Left-border tint for a list row, per the blueprint colour code:
 * blue = awaiting client, yellow = deadline within 5 days, red = overdue,
 * grey/none = completed or closed.
 */
export function rowAccent(input: {
  status: ProjectStatus;
  internalDeadline: Date | string | null;
  deadlinePausedAt?: Date | string | null;
}): RowAccent {
  if (input.status === "AWAITING_CLIENT_INPUT") return "waiting";
  if (["COMPLETED", "CANCELLED", "REFUNDED"].includes(input.status)) return "done";
  // A stopped clock is a wait, not a risk: never paint a paused row red.
  if (clockPause({ status: input.status, deadlinePausedAt: input.deadlinePausedAt })) return "waiting";

  const { urgency } = deadlineInfo(input.internalDeadline);
  if (urgency === "overdue") return "risk";
  if (urgency === "urgent" || urgency === "critical" || urgency === "soon") return "soon";
  if (urgency === "ok") return "ok";
  return "none";
}

/**
 * The same colour code as a small dot beside the project ID — the list keeps
 * its meaning without drawing a coloured edge on every row.
 */
export const ROW_ACCENT_DOT: Record<RowAccent, string> = {
  none: "bg-transparent",
  ok: "bg-success/60",
  soon: "bg-gold",
  risk: "bg-danger",
  waiting: "bg-info",
  done: "bg-border-hover",
};

export const ROW_ACCENT_CLASS: Record<RowAccent, string> = {
  none: "border-l-2 border-l-transparent",
  ok: "border-l-2 border-l-success/50",
  soon: "border-l-2 border-l-gold",
  risk: "border-l-2 border-l-danger",
  waiting: "border-l-2 border-l-info",
  done: "border-l-2 border-l-border",
};

export interface FinancialBreakdown {
  total: number;
  downpaymentAmount: number;
  downpaymentStatus: string;
  balanceAmount: number;
  balanceStatus: string;
  ambassadorName: string | null;
  ambassadorRate: number | null;
  ambassadorCommission: number | null;
  ambassadorCommPaid: boolean;
  workerName: string | null;
  workerPayoutRate: number;
  workerPayout: number | null;
  educraftRevenue: number | null;
  /** Payouts are only due once the project is COMPLETED. */
  payoutsDue: boolean;
}

export function financialBreakdown(project: {
  price: number;
  status: ProjectStatus;
  downpaymentAmount: number;
  downpaymentStatus: string;
  balanceAmount: number;
  balanceStatus: string;
  ambassadorCommRate: number | null;
  ambassadorCommission: number | null;
  ambassadorCommPaid: boolean;
  workerPayoutRate: number;
  workerPayout: number | null;
  educraftRevenue: number | null;
  ambassador: { fullName: string } | null;
  worker: { fullName: string } | null;
}): FinancialBreakdown {
  const workerRate = project.workerPayoutRate || 40;
  const workerPayout = project.workerPayout ?? (project.price * workerRate) / 100;
  const ambassadorCommission =
    project.ambassadorCommission ??
    (project.ambassadorCommRate ? (project.price * project.ambassadorCommRate) / 100 : null);
  const educraftRevenue =
    project.educraftRevenue ??
    project.price - workerPayout - (ambassadorCommission ?? 0);

  return {
    total: project.price,
    downpaymentAmount: project.downpaymentAmount,
    downpaymentStatus: project.downpaymentStatus,
    balanceAmount: project.balanceAmount,
    balanceStatus: project.balanceStatus,
    ambassadorName: project.ambassador?.fullName ?? null,
    ambassadorRate: project.ambassadorCommRate,
    ambassadorCommission,
    ambassadorCommPaid: project.ambassadorCommPaid,
    workerName: project.worker?.fullName ?? null,
    workerPayoutRate: workerRate,
    workerPayout,
    educraftRevenue,
    payoutsDue: project.status === "COMPLETED",
  };
}

/** Files grouped by their `category` for the Files tab. */
export const FILE_CATEGORY_LABELS: Record<string, string> = {
  from_client: "From client",
  from_worker: "From worker",
  qa_reviewed: "QA reviewed",
  delivered: "Delivered to client",
  supervisor_correction: "Supervisor corrections",
  ch34_data: "Chapter 3/4 data",
  department_outline: "Department outline",
  message_attachment: "Sent in messages",
};


// ── The deadline as a screen should show it ─────────────────────────────────

export interface DeadlineView {
  /** The pause the project is under, or null when its clock is running. */
  pause: ClockPause | null;
  /** The date to show: it moves with a pause, so a paused project is never late for waiting. */
  deadline: Date | null;
  info: ReturnType<typeof deadlineInfo>;
}

/**
 * One answer for every staff screen that shows a deadline. Ask this rather
 * than reading `internalDeadline` directly, or a paused project drifts into
 * "overdue" for every day it stands still.
 */
export function deadlineView(
  input: {
    status: ProjectStatus | string;
    internalDeadline: Date | string | null;
    clientDeadline?: Date | string | null;
    deadlinePausedAt?: Date | string | null;
  },
  now: Date = new Date()
): DeadlineView {
  const pause = clockPause({ status: input.status, deadlinePausedAt: input.deadlinePausedAt }, now);
  const deadline = liveDeadline(input.internalDeadline ?? input.clientDeadline ?? null, pause, now);
  return { pause, deadline, info: deadlineInfo(deadline, now) };
}
