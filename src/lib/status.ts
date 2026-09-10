import type { ProjectStatus } from "@prisma/client";

/**
 * Single source of truth for how a project status is named and coloured.
 *
 * `label` is what a human reads, `short` is what fits inside a pipeline
 * segment on a 375px screen, and `badge` is the Tailwind recipe. Colours are
 * expressed in tokens where the brand has one (primary = teal, gold, success,
 * danger, info) and in palette colours only for the stages the token set does
 * not cover — both hold up in light and dark because every fill is an alpha
 * wash over the page ground.
 */
export interface StatusMeta {
  label: string;
  short: string;
  badge: string;
}

export const STATUS_META: Record<ProjectStatus, StatusMeta> = {
  NEW: {
    label: "New",
    short: "New",
    badge: "border-border bg-elevated text-muted-foreground",
  },
  DOWNPAYMENT_VERIFIED: {
    label: "Downpayment Verified",
    short: "Downpay",
    badge: "border-transparent bg-info/15 text-info",
  },
  REQUIREMENTS_CONFIRMED: {
    label: "Requirements Confirmed",
    short: "Confirmed",
    badge: "border-transparent bg-info/15 text-info",
  },
  ASSIGNED: {
    label: "Assigned",
    short: "Assigned",
    badge: "border-transparent bg-purple-500/15 text-purple-600 dark:text-purple-400",
  },
  IN_PROGRESS: {
    label: "In Progress",
    short: "Progress",
    badge: "border-transparent bg-primary/15 text-primary",
  },
  AWAITING_CLIENT_INPUT: {
    label: "Awaiting Client Input",
    short: "Waiting",
    badge: "border-transparent bg-gold/15 text-gold",
  },
  SUBMITTED: {
    label: "Submitted",
    short: "Submitted",
    badge: "border-transparent bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  },
  IN_QA_REVIEW: {
    label: "In QA Review",
    short: "QA",
    badge: "border-transparent bg-orange-500/15 text-orange-600 dark:text-orange-400",
  },
  REVISION_NEEDED: {
    label: "Revision Needed",
    short: "Revision",
    badge: "border-transparent bg-orange-500/15 text-orange-600 dark:text-orange-400",
  },
  APPROVED: {
    label: "Approved",
    short: "Approved",
    badge: "border-transparent bg-success/15 text-success",
  },
  BALANCE_VERIFIED: {
    label: "Balance Verified",
    short: "Balance",
    badge: "border-transparent bg-success/15 text-success",
  },
  DELIVERED: {
    label: "Delivered",
    short: "Delivered",
    badge: "border-transparent bg-success/15 text-success",
  },
  SUPERVISOR_CORRECTIONS: {
    label: "Supervisor Corrections",
    short: "Corrections",
    badge: "border-transparent bg-gold/15 text-gold",
  },
  COMPLETED: {
    label: "Completed",
    short: "Completed",
    badge: "border-transparent bg-success/20 text-success",
  },
  ON_HOLD: {
    label: "On Hold",
    short: "On Hold",
    badge: "border-border bg-elevated text-muted-foreground",
  },
  CANCELLED: {
    label: "Cancelled",
    short: "Cancelled",
    badge: "border-border bg-elevated text-subtle line-through",
  },
  REFUNDED: {
    label: "Refunded",
    short: "Refunded",
    badge: "border-border bg-elevated text-subtle line-through",
  },
  DISPUTED: {
    label: "Disputed",
    short: "Disputed",
    badge: "border-transparent bg-danger/15 text-danger",
  },
};

/**
 * The eleven stages the Command Center pipeline bar renders, in flow order.
 * REVISION_NEEDED and SUPERVISOR_CORRECTIONS are loops back into the flow
 * rather than stages of it, so they are surfaced as alerts, not segments.
 */
export const PIPELINE_STATUSES = [
  "NEW",
  "DOWNPAYMENT_VERIFIED",
  "REQUIREMENTS_CONFIRMED",
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_CLIENT_INPUT",
  "SUBMITTED",
  "IN_QA_REVIEW",
  "APPROVED",
  "BALANCE_VERIFIED",
  "DELIVERED",
] as const satisfies readonly ProjectStatus[];

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

/** A project in one of these is off the board — it stops counting as active. */
export const CLOSED_STATUSES = [
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
] as const satisfies readonly ProjectStatus[];

export function statusMeta(status: ProjectStatus): StatusMeta {
  return STATUS_META[status];
}

export function statusLabel(status: ProjectStatus): string {
  return STATUS_META[status]?.label ?? status;
}
