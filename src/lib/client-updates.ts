import type { ProjectStatus } from "@prisma/client";

/**
 * The client's activity feed wording for a status change: fixed text, never
 * the internal status-log note (which carries QA feedback, pause reasons and
 * payment references). Returns null for moves the client should not see as a
 * separate event: QA loops, internal hand-offs, disputes, and the payment
 * steps (those get their own "Payment received" entry). Pure.
 */
export interface FeedText {
  title: string;
  body?: string;
}

export function statusFeedEntry(from: ProjectStatus, to: ProjectStatus): FeedText | null {
  switch (to) {
    case "REQUIREMENTS_CONFIRMED":
      return { title: "Requirements confirmed", body: "We have what we need to begin." };
    case "ASSIGNED":
      return { title: "Specialist assigned", body: "A specialist in your field is now on your project." };
    case "IN_PROGRESS":
      if (from === "ASSIGNED") return { title: "Work started" };
      if (from === "AWAITING_CLIENT_INPUT") return { title: "Work resumed", body: "Thank you. Your specialist is back at work." };
      return null;
    case "AWAITING_CLIENT_INPUT":
      return {
        title: "We need something from you",
        body: "Check your messages for what we need. Your delivery date waits while we wait for you.",
      };
    case "SUBMITTED":
      return from === "IN_PROGRESS" ? { title: "Quality check started", body: "Your project is being checked before delivery." } : null;
    case "APPROVED":
      return { title: "Quality check passed" };
    case "DELIVERED":
      return from === "SUPERVISOR_CORRECTIONS"
        ? { title: "Corrections delivered", body: "Your supervisor's corrections are done." }
        : { title: "Delivered", body: "Your project has been delivered." };
    case "SUPERVISOR_CORRECTIONS":
      return { title: "Supervisor corrections received", body: "We're working on them." };
    case "COMPLETED":
      return { title: "Project complete", body: "Thank you for choosing EduCraft." };
    case "CANCELLED":
      return { title: "Project cancelled" };
    case "REFUNDED":
      return { title: "Refund processed" };
    default:
      return null;
  }
}
