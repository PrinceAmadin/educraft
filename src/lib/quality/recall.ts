/**
 * The 30-minute recall after the quality gate sends a report to QA on its own
 * (the report production spec v1: "Recall from QA", available for 30 minutes
 * after auto-submission). Only while the report still waits in the queue: once
 * a reviewer has started (IN_QA_REVIEW) it is theirs. Pure.
 */

export const RECALL_WINDOW_MINUTES = 30;

export type RecallState = "OPEN" | "NOT_AUTO_SUBMITTED" | "ALREADY_RECALLED" | "WINDOW_CLOSED" | "REVIEW_STARTED" | "NOT_IN_QUEUE";

export interface RecallFacts {
  status: string;
  autoSubmittedAt: Date | null;
  recallWindowExpiresAt: Date | null;
  recalledAt: Date | null;
}

export function recallWindowEnd(autoSubmittedAt: Date): Date {
  return new Date(autoSubmittedAt.getTime() + RECALL_WINDOW_MINUTES * 60_000);
}

export function recallState(f: RecallFacts, now: Date = new Date()): RecallState {
  if (!f.autoSubmittedAt || !f.recallWindowExpiresAt) return "NOT_AUTO_SUBMITTED";
  if (f.recalledAt && f.recalledAt >= f.autoSubmittedAt) return "ALREADY_RECALLED";
  if (f.status === "IN_QA_REVIEW") return "REVIEW_STARTED";
  if (f.status !== "SUBMITTED") return "NOT_IN_QUEUE";
  if (now.getTime() >= f.recallWindowExpiresAt.getTime()) return "WINDOW_CLOSED";
  return "OPEN";
}

/** The answer each state gives a recall request (the route's 409 code and message). */
export const RECALL_REFUSAL: Record<Exclude<RecallState, "OPEN">, { code: string; message: string }> = {
  NOT_AUTO_SUBMITTED: { code: "NOT_AUTO_SUBMITTED", message: "Only a report the quality check sent to QA can be recalled." },
  ALREADY_RECALLED: { code: "ALREADY_RECALLED", message: "This report has already been recalled." },
  WINDOW_CLOSED: { code: "RECALL_WINDOW_CLOSED", message: `The ${RECALL_WINDOW_MINUTES}-minute recall window has closed.` },
  REVIEW_STARTED: { code: "REVIEW_STARTED", message: "A QA reviewer has already started on this report." },
  NOT_IN_QUEUE: { code: "NOT_IN_QUEUE", message: "The report is no longer waiting in the QA queue." },
};
