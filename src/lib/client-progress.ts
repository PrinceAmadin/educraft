import type { ProjectStatus } from "@prisma/client";

/**
 * What a client sees of their project's progress, in client words.
 *
 * The internal pipeline has 18 statuses, some of them about our own process
 * (QA revisions, holds, disputes). Clients get a short, honest step list
 * instead: nothing here ever mentions revisions, internal notes, automation or
 * who the specialist is. Pure: no database access.
 */

export type ClientStepKey =
  | "received"
  | "payment"
  | "assigned"
  | "research"
  | "writing"
  | "quality"
  | "balance"
  | "delivered";

export type StepState = "done" | "current" | "upcoming";

export interface ClientStep {
  key: ClientStepKey;
  label: string;
  state: StepState;
  /** A short line under the step, e.g. "Paid" or "Waiting for you". */
  detail?: string;
}

export type ProgressTone = "normal" | "attention" | "paused" | "closed" | "done";

export interface ClientProgress {
  steps: ClientStep[];
  /** 0-100, for the progress bar. */
  percent: number;
  headline: string;
  tone: ProgressTone;
}

export interface ProgressInput {
  status: ProjectStatus;
  isProBono: boolean;
  downpaymentStatus: string;
  balanceStatus: string;
  /** Research only becomes a step once a research run exists for the project. */
  research: "none" | "running" | "done";
  /** For ON_HOLD / DISPUTED: the status the project was in before the hold. */
  heldFrom?: ProjectStatus | null;
  /** Chapters released to the client so far, for "2 of 5 chapters ready". */
  chapters?: { ready: number; total: number } | null;
}

const LABELS: Record<ClientStepKey, string> = {
  received: "Order received",
  payment: "Downpayment",
  assigned: "Specialist assigned",
  research: "Research",
  writing: "Writing",
  quality: "Quality check",
  balance: "Balance",
  delivered: "Delivered",
};

/**
 * What the step on screen is doing right now. A step that is still under way
 * must not read as done: "Specialist assigned" while we are still choosing one
 * told clients something that wasn't true yet.
 */
const CURRENT_LABELS: Record<ClientStepKey, string> = {
  received: "Order received",
  payment: "Downpayment due",
  assigned: "Choosing your specialist",
  research: "Gathering sources",
  writing: "Writing",
  quality: "In our quality check",
  balance: "Balance due",
  delivered: "Preparing your delivery",
};

const ORDER: ClientStepKey[] = ["received", "payment", "assigned", "research", "writing", "quality", "balance", "delivered"];

/** The step a status is working on (for closed statuses: the last one reached). */
const STATUS_STEP: Record<ProjectStatus, ClientStepKey> = {
  NEW: "payment",
  DOWNPAYMENT_VERIFIED: "assigned",
  REQUIREMENTS_CONFIRMED: "assigned",
  ASSIGNED: "assigned",
  IN_PROGRESS: "writing",
  AWAITING_CLIENT_INPUT: "writing",
  SUBMITTED: "quality",
  IN_QA_REVIEW: "quality",
  REVISION_NEEDED: "quality",
  APPROVED: "balance",
  BALANCE_VERIFIED: "delivered",
  DELIVERED: "delivered",
  SUPERVISOR_CORRECTIONS: "delivered",
  COMPLETED: "delivered",
  ON_HOLD: "writing",
  CANCELLED: "received",
  REFUNDED: "received",
  DISPUTED: "writing",
};

const FINISHED: ProjectStatus[] = ["DELIVERED", "SUPERVISOR_CORRECTIONS", "COMPLETED"];
const HOLDS: ProjectStatus[] = ["ON_HOLD", "DISPUTED"];

function headlineFor(input: ProgressInput): { headline: string; tone: ProgressTone } {
  const balancePaid = input.balanceStatus === "Verified";
  switch (input.status) {
    case "NEW":
      return { headline: "Pay your downpayment so we can start.", tone: "attention" };
    case "DOWNPAYMENT_VERIFIED":
      return { headline: "Payment received. We're reviewing your requirements.", tone: "normal" };
    case "REQUIREMENTS_CONFIRMED":
      return { headline: "Your requirements are confirmed. We're choosing your specialist.", tone: "normal" };
    case "ASSIGNED":
      return { headline: "Your specialist has been assigned and is getting started.", tone: "normal" };
    case "IN_PROGRESS":
      return {
        headline:
          input.research === "running" ? "We're gathering sources for your topic." : "Your project is being written.",
        tone: "normal",
      };
    case "AWAITING_CLIENT_INPUT":
      return { headline: "We're waiting for something from you. Check your messages.", tone: "attention" };
    case "SUBMITTED":
    case "IN_QA_REVIEW":
      return { headline: "Your project is in our quality check.", tone: "normal" };
    case "REVISION_NEEDED":
      return { headline: "We're polishing a few things after our quality check.", tone: "normal" };
    case "APPROVED":
      return balancePaid
        ? { headline: "Quality check passed. We're preparing your delivery.", tone: "normal" }
        : { headline: "Quality check passed. Pay your balance to unlock delivery.", tone: "attention" };
    case "BALANCE_VERIFIED":
      return { headline: "Everything is paid. We're preparing your delivery.", tone: "normal" };
    case "DELIVERED":
      return { headline: "Your project has been delivered.", tone: "done" };
    case "SUPERVISOR_CORRECTIONS":
      return { headline: "We're working on your supervisor's corrections.", tone: "normal" };
    case "COMPLETED":
      return { headline: "Your project is complete. Thank you for choosing EduCraft.", tone: "done" };
    case "ON_HOLD":
      return { headline: "Your project is paused for now. We'll message you.", tone: "paused" };
    case "DISPUTED":
      return { headline: "We're looking into this project and will be in touch.", tone: "paused" };
    case "CANCELLED":
      return { headline: "This project was cancelled. Message us if this is unexpected.", tone: "closed" };
    case "REFUNDED":
      return { headline: "This project was refunded.", tone: "closed" };
  }
}

export function clientProgress(input: ProgressInput): ClientProgress {
  const keys = ORDER.filter((k) => {
    if (input.isProBono && (k === "payment" || k === "balance")) return false;
    if (k === "research" && input.research === "none") return false;
    return true;
  });

  const effective = HOLDS.includes(input.status) ? input.heldFrom ?? "IN_PROGRESS" : input.status;
  const finished = FINISHED.includes(effective);
  let currentKey: ClientStepKey | null = finished ? null : STATUS_STEP[effective];
  if (currentKey === "writing" && input.research === "running") currentKey = "research";
  if (currentKey === "balance" && (input.balanceStatus === "Verified" || input.isProBono)) currentKey = "delivered";
  if (currentKey && !keys.includes(currentKey)) currentKey = keys[keys.indexOf("delivered")] ?? null;

  const currentIndex = currentKey ? keys.indexOf(currentKey) : keys.length;
  const balancePaid = input.balanceStatus === "Verified";

  const steps: ClientStep[] = keys.map((key, i) => {
    let state: StepState = i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
    let detail: string | undefined;
    // The balance can be paid before the quality check; show it as done early.
    if (key === "balance" && balancePaid) {
      state = "done";
      detail = "Paid";
    }
    if (key === "payment" && input.downpaymentStatus === "Verified") state = "done";
    if (state === "current") {
      if (key === "payment") detail = "Pay your downpayment to start";
      if (key === "balance") detail = "Pay your balance to unlock delivery";
      if (key === "writing" && effective === "AWAITING_CLIENT_INPUT") detail = "Waiting for you";
      else if (key === "writing" && input.chapters && input.chapters.total > 0 && input.chapters.ready > 0) {
        detail = `${input.chapters.ready} of ${input.chapters.total} chapters ready`;
      }
    }
    return { key, label: state === "current" ? CURRENT_LABELS[key] : LABELS[key], state, detail };
  });

  const doneCount = steps.filter((s) => s.state === "done").length;
  const hasCurrent = steps.some((s) => s.state === "current");
  const percent = finished ? 100 : Math.round(((doneCount + (hasCurrent ? 0.5 : 0)) / steps.length) * 100);

  const { headline, tone } = headlineFor(input);
  return { steps, percent: Math.min(100, percent), headline, tone };
}

export interface DeliveryCountdown {
  /** The date to show, or null when none is set. */
  date: Date | null;
  label: string;
  tone: "normal" | "gold" | "danger" | "success";
}

/**
 * "12 days left", "Due today", or "Paused" while we wait for the client
 * (the date then moves on by the days paused).
 */
export function deliveryCountdown(input: {
  expectedDeliveryAt: Date | null;
  deadlinePausedAt: Date | null;
  status: ProjectStatus;
  now?: Date;
}): DeliveryCountdown {
  const date = input.expectedDeliveryAt;
  if (FINISHED.includes(input.status)) return { date, label: "Delivered", tone: "success" };
  if (input.status === "CANCELLED" || input.status === "REFUNDED") return { date: null, label: "", tone: "normal" };
  // Nothing has started before the downpayment: a date here would be a promise we haven't made.
  if (input.status === "NEW") return { date: null, label: "Your delivery date is set once your downpayment is in.", tone: "normal" };
  if (input.deadlinePausedAt) {
    return { date, label: "Paused while we wait for you. The date moves on by the days paused.", tone: "gold" };
  }
  if (!date) return { date: null, label: "We'll confirm your delivery date soon.", tone: "normal" };
  const now = input.now ?? new Date();
  const days = Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
  if (days > 1) return { date, label: `${days} days left`, tone: days <= 3 ? "gold" : "normal" };
  if (days === 1) return { date, label: "1 day left", tone: "gold" };
  if (days === 0) return { date, label: "Due today", tone: "gold" };
  return { date, label: "A little behind schedule. We'll keep you updated.", tone: "danger" };
}
