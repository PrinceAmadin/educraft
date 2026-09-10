import type { ProjectStatus } from "@prisma/client";

/**
 * The project pipeline state machine — pure, no database. Both the API
 * (enforcement) and the project detail page (which buttons to show) import
 * from here.
 */

export interface TransitionRule {
  to: ProjectStatus;
  /** Label for the action button that performs this move. */
  action: string;
  /** Prompt the admin for a note before this transition (reason / details). */
  requiresNote?: boolean;
  /** Rendered by a dedicated control elsewhere — don't show a generic button. */
  external?: boolean;
  /** Returns null when allowed, or a reason string when blocked. */
  guard?: (p: TransitionCandidate) => string | null;
}

/** Everything a guard might read about a project. */
export interface TransitionCandidate {
  status: ProjectStatus;
  workerId: string | null;
  workerAccepted: boolean;
  downpaymentStatus: string;
  balanceStatus: string;
  qaStatus: string | null;
  projectTitle: string | null;
  serviceId: string;
  /** True when the brief has at least one of: instructions, outline, extra data. */
  hasRequirementDetail: boolean;
  /** Files uploaded in the `from_worker` category. */
  workerFileCount: number;
}

export const MAX_REVISIONS = 3;

/**
 * Allowed forward transitions, keyed by current status. Admin-only holds
 * (ON_HOLD, CANCELLED, REFUNDED, DISPUTED) are handled separately.
 */
export const TRANSITIONS: Partial<Record<ProjectStatus, TransitionRule[]>> = {
  NEW: [
    {
      to: "DOWNPAYMENT_VERIFIED",
      action: "Verify downpayment",
      external: true, // done through the payment-verify control
      guard: (p) =>
        p.downpaymentStatus === "Verified" ? null : "Downpayment is not verified yet",
    },
  ],
  DOWNPAYMENT_VERIFIED: [
    {
      to: "REQUIREMENTS_CONFIRMED",
      action: "Confirm requirements",
      guard: (p) => {
        if (!p.projectTitle || !p.serviceId) return "Project needs a title and a service";
        if (!p.hasRequirementDetail && p.workerFileCount === 0) {
          return "Add instructions, an outline, or a file before confirming";
        }
        return null;
      },
    },
  ],
  REQUIREMENTS_CONFIRMED: [
    {
      to: "ASSIGNED",
      action: "Assign worker",
      external: true, // done through the assignment screen
      guard: (p) => (p.workerId ? null : "No worker assigned"),
    },
  ],
  ASSIGNED: [
    {
      to: "IN_PROGRESS",
      action: "Mark in progress",
      guard: (p) => (p.workerAccepted ? null : "Worker has not accepted yet"),
    },
  ],
  IN_PROGRESS: [
    { to: "AWAITING_CLIENT_INPUT", action: "Pause for client input", requiresNote: true },
    {
      to: "SUBMITTED",
      action: "Mark submitted",
      guard: (p) => (p.workerFileCount > 0 ? null : "No worker files uploaded yet"),
    },
  ],
  AWAITING_CLIENT_INPUT: [{ to: "IN_PROGRESS", action: "Resume work" }],
  SUBMITTED: [{ to: "IN_QA_REVIEW", action: "Move to QA" }],
  IN_QA_REVIEW: [
    {
      to: "APPROVED",
      action: "Approve",
      guard: (p) => (p.qaStatus === "Passed" ? null : "QA has not passed"),
    },
    { to: "REVISION_NEEDED", action: "Request revision", requiresNote: true },
  ],
  REVISION_NEEDED: [{ to: "SUBMITTED", action: "Mark resubmitted" }],
  APPROVED: [
    {
      to: "BALANCE_VERIFIED",
      action: "Verify balance",
      external: true,
      guard: (p) => (p.balanceStatus === "Verified" ? null : "Balance is not verified yet"),
    },
  ],
  BALANCE_VERIFIED: [{ to: "DELIVERED", action: "Deliver" }],
  DELIVERED: [
    { to: "SUPERVISOR_CORRECTIONS", action: "Log supervisor corrections", requiresNote: true },
    { to: "COMPLETED", action: "Mark completed" },
  ],
  SUPERVISOR_CORRECTIONS: [{ to: "DELIVERED", action: "Re-deliver" }],
};

/** Admin overrides available from most non-terminal statuses. */
export const ADMIN_HOLDS: ProjectStatus[] = ["ON_HOLD", "CANCELLED", "REFUNDED", "DISPUTED"];

const TERMINAL: ProjectStatus[] = ["COMPLETED", "CANCELLED", "REFUNDED"];

export function allowedTransitions(candidate: TransitionCandidate): TransitionRule[] {
  return TRANSITIONS[candidate.status] ?? [];
}

/** All rules for a status (ignoring guards) — used for label lookups. */
export function transitionRule(from: ProjectStatus, to: ProjectStatus): TransitionRule | null {
  return (TRANSITIONS[from] ?? []).find((r) => r.to === to) ?? null;
}

export function isTerminal(status: ProjectStatus): boolean {
  return TERMINAL.includes(status);
}

/** Build the guard candidate from a loaded project. */
export function toCandidate(project: {
  status: ProjectStatus;
  workerId: string | null;
  workerAccepted: boolean;
  downpaymentStatus: string;
  balanceStatus: string;
  qaStatus: string | null;
  projectTitle: string | null;
  serviceId: string;
  specialInstructions: string | null;
  departmentOutline: string | null;
  additionalData: unknown;
  files: { category: string }[];
}): TransitionCandidate {
  const hasRequirementDetail =
    Boolean(project.specialInstructions?.trim()) ||
    Boolean(project.departmentOutline?.trim()) ||
    (project.additionalData != null &&
      typeof project.additionalData === "object" &&
      Object.keys(project.additionalData as object).length > 0);

  return {
    status: project.status,
    workerId: project.workerId,
    workerAccepted: project.workerAccepted,
    downpaymentStatus: project.downpaymentStatus,
    balanceStatus: project.balanceStatus,
    qaStatus: project.qaStatus,
    projectTitle: project.projectTitle,
    serviceId: project.serviceId,
    hasRequirementDetail,
    workerFileCount: project.files.filter((f) => f.category === "from_worker").length,
  };
}
