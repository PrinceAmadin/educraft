import type { ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";

/** Client-facing milestones. Internal statuses collapse onto these. */
export const TRACK_MILESTONES = [
  { key: "received", label: "Received" },
  { key: "confirmed", label: "Requirements confirmed" },
  { key: "in_progress", label: "In progress" },
  { key: "review", label: "Quality review" },
  { key: "ready", label: "Ready" },
  { key: "delivered", label: "Delivered" },
] as const;

export type TrackMilestone = (typeof TRACK_MILESTONES)[number]["key"];

const STATUS_TO_MILESTONE: Record<ProjectStatus, TrackMilestone> = {
  NEW: "received",
  DOWNPAYMENT_VERIFIED: "confirmed",
  REQUIREMENTS_CONFIRMED: "confirmed",
  ASSIGNED: "in_progress",
  IN_PROGRESS: "in_progress",
  AWAITING_CLIENT_INPUT: "in_progress",
  REVISION_NEEDED: "in_progress",
  SUBMITTED: "review",
  IN_QA_REVIEW: "review",
  APPROVED: "ready",
  BALANCE_VERIFIED: "ready",
  DELIVERED: "delivered",
  SUPERVISOR_CORRECTIONS: "delivered",
  COMPLETED: "delivered",
  ON_HOLD: "in_progress",
  CANCELLED: "received",
  REFUNDED: "received",
  DISPUTED: "review",
};

const MESSAGES: Partial<Record<ProjectStatus, string>> = {
  NEW: "We've received your request. Please complete your downpayment so work can begin.",
  DOWNPAYMENT_VERIFIED: "Payment received. Our team is reviewing your requirements.",
  REQUIREMENTS_CONFIRMED: "Your requirements are confirmed. We're assigning a specialist.",
  ASSIGNED: "A specialist has been assigned to your project.",
  IN_PROGRESS: "Your project is being worked on.",
  AWAITING_CLIENT_INPUT: "We're waiting on some information from you — please check your WhatsApp.",
  REVISION_NEEDED: "Your project is being revised after quality review.",
  SUBMITTED: "Your project is in quality review.",
  IN_QA_REVIEW: "Your project is in quality review.",
  APPROVED: "Your project is ready. Please complete the balance payment to unlock delivery.",
  BALANCE_VERIFIED: "Balance received. Your project is being prepared for delivery.",
  DELIVERED: "Your project has been delivered. Check your email or WhatsApp.",
  SUPERVISOR_CORRECTIONS: "We're applying corrections requested by your supervisor.",
  COMPLETED: "Your project is complete. Thank you for choosing EduCraft.",
  ON_HOLD: "Your project is on hold. We'll be in touch.",
  CANCELLED: "This project has been cancelled. Contact us if this is unexpected.",
  REFUNDED: "This project was refunded.",
  DISPUTED: "This project is under review. Our team will contact you.",
};

export interface TrackingResult {
  projectId: string;
  title: string | null;
  serviceName: string;
  status: ProjectStatus;
  milestone: TrackMilestone;
  message: string;
  updatedAt: string;
  /** Shown only when a payment step is what's blocking progress. */
  awaitingPayment: "downpayment" | "balance" | null;
}

/** Public lookup by the human EC-XXXXX code only. No sensitive fields. */
export async function getPublicTracking(code: string): Promise<TrackingResult | null> {
  const normalized = code.trim().toUpperCase();
  const project = await db.project.findUnique({
    where: { projectId: normalized },
    select: {
      projectId: true,
      projectTitle: true,
      status: true,
      updatedAt: true,
      downpaymentStatus: true,
      balanceStatus: true,
      service: { select: { serviceName: true } },
    },
  });
  if (!project) return null;

  let awaitingPayment: TrackingResult["awaitingPayment"] = null;
  if (project.status === "NEW" && project.downpaymentStatus !== "Verified") {
    awaitingPayment = "downpayment";
  } else if (project.status === "APPROVED" && project.balanceStatus !== "Verified") {
    awaitingPayment = "balance";
  }

  return {
    projectId: project.projectId,
    title: project.projectTitle,
    serviceName: project.service.serviceName,
    status: project.status,
    milestone: STATUS_TO_MILESTONE[project.status],
    message: MESSAGES[project.status] ?? "Your project is being processed.",
    updatedAt: project.updatedAt.toISOString(),
    awaitingPayment,
  };
}
