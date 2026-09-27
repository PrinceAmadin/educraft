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

/** D4: every sentence the client reads about a data pause outside the request itself (notifications, email, feed). */
export const DATA_PAUSE_CLIENT_TEXT = {
  requestTitle: "EduCraft needs your data files",
  requestBody: "Your specialist has reached a point in your report where they need data files from you. Please log in to upload them.",
  requestWait: "Your delivery date waits while we wait for your files.",
  requestCta: "Upload my files",
  requestFeedTitle: "We need your data files",
  requestFeedBody: "Open the Progress tab to see exactly what to upload. Your delivery date waits while we wait for your files.",
  receivedFeedTitle: "Your files were received",
  receivedFeedBody: "Your files were received. We'll review them shortly.",
  moreTitle: "Your specialist needs a little more",
  moreBody: "Open the Progress tab to see what else to upload.",
  checkedTitle: "Your files are checked",
  checkedBody: "Your specialist has checked your files. Work on your report continues and your delivery date has moved on by the days we waited.",
  cancelledTitle: "We don't need the data files after all",
  cancelledBody: "Work on your report continues and your delivery date has moved on by the days we waited.",
} as const;
