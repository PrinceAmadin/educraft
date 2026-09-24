import type { ProjectStatus } from "@prisma/client";
import { CORRECTION_LIMIT_MESSAGE, MAX_CORRECTION_ROUNDS, roundsSoFar } from "@/lib/operations/corrections";

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
  /**
   * A complete document has been uploaded (Documents tab) but never released
   * to the client. Delivery waits for the release; projects that only ever
   * had a pasted link are not held up.
   */
  finalAwaitingRelease?: boolean;
  /**
   * Supervisor correction rounds so far. Three are part of the service; a
   * fourth is a new order, so the move into corrections is refused at three.
   */
  correctionRounds?: number;
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
      // Missing brief detail is no longer a dead end here — the UI prompts
      // for a note and the service layer saves it as the project's
      // instructions instead of just logging it, so there's always a way
      // through. Only a genuinely broken project record (no title/service)
      // stays blocked.
      guard: (p) => (!p.projectTitle || !p.serviceId ? "Project needs a title and a service" : null),
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
  BALANCE_VERIFIED: [
    {
      to: "DELIVERED",
      action: "Deliver",
      guard: (p) =>
        p.finalAwaitingRelease
          ? "Release the complete document to the client first (Documents tab). Releasing it delivers the project."
          : null,
    },
  ],
  DELIVERED: [
    {
      to: "SUPERVISOR_CORRECTIONS",
      action: "Log supervisor corrections",
      requiresNote: true,
      guard: (p) => ((p.correctionRounds ?? 0) >= MAX_CORRECTION_ROUNDS ? CORRECTION_LIMIT_MESSAGE : null),
    },
    { to: "COMPLETED", action: "Mark completed" },
  ],
  SUPERVISOR_CORRECTIONS: [{ to: "DELIVERED", action: "Re-deliver" }],
};

/** Admin overrides available from most non-terminal statuses. */
export const ADMIN_HOLDS = ["ON_HOLD", "CANCELLED", "REFUNDED", "DISPUTED"] as const;
export type AdminHold = (typeof ADMIN_HOLDS)[number];

export const HOLD_LABELS: Record<AdminHold, string> = {
  ON_HOLD: "Put on hold",
  CANCELLED: "Cancel project",
  REFUNDED: "Mark refunded",
  DISPUTED: "Mark disputed",
};

const TERMINAL: ProjectStatus[] = ["COMPLETED", "CANCELLED", "REFUNDED"];

/**
 * Admin holds are allowed from any non-terminal status. ON_HOLD can also be
 * lifted back to the status the project was in before (handled server-side).
 */
export function canHold(from: ProjectStatus, to: AdminHold): boolean {
  if (from === to) return false;
  return !TERMINAL.includes(from);
}

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
  deliverables?: { versions: { releaseNo: number | null }[] }[];
  supervisorCorrectionCount?: number;
  _count?: { correctionRounds?: number };
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
    finalAwaitingRelease: finalAwaitingRelease(project.deliverables ?? []),
    correctionRounds: roundsSoFar(project._count?.correctionRounds ?? 0, project.supervisorCorrectionCount ?? 0),
  };
}

/** True when a complete document was uploaded but no version of it has been released. */
export function finalAwaitingRelease(finals: { versions: { releaseNo: number | null }[] }[]): boolean {
  const uploaded = finals.some((d) => d.versions.length > 0);
  const released = finals.some((d) => d.versions.some((v) => v.releaseNo != null));
  return uploaded && !released;
}
