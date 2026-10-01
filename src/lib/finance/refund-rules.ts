/**
 * Refund stage rules (Phase 6), pure so they can be checked without a database.
 * A refund's stage reflects how far the work had gone when the client asked for
 * their money back, which sets the default percentage; the CFO can override
 * within the stage's bounds. The worker is paid for chapters already delivered
 * (decision 7). Facts are gathered in services/finance/refunds.ts.
 */
import { CHAPTER_SHARES } from "@/lib/chapter-pricing";

export type RefundStage = 1 | 2 | 3 | 4;

export interface RefundFacts {
  now: Date;
  /** When the downpayment was verified (the 48-hour "before any work" window). */
  downpaymentVerifiedAt: Date | null;
  /** Generation ran, a specialist uploaded, an orchestrator run exists, or the project is past Assigned. */
  workStarted: boolean;
  /** Chapter numbers released to the client. */
  releasedChapters: number[];
  /** The complete report was released, or the project is delivered/completed. */
  completeReleased: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Within 48 hours of the verified downpayment — the strong "full refund" signal. */
export function withinStageOneWindow(f: RefundFacts): boolean {
  return f.downpaymentVerifiedAt != null && f.now.getTime() - f.downpaymentVerifiedAt.getTime() <= 2 * DAY_MS;
}

/** Most-complete wins: a delivered report is stage 4 even though its chapters are also released. */
export function detectRefundStage(f: RefundFacts): RefundStage {
  if (f.completeReleased) return 4;
  if (f.releasedChapters.includes(1) || f.releasedChapters.includes(2)) return 3;
  if (f.workStarted) return 2;
  return 1;
}

export const STAGE_RULES: Record<RefundStage, { defaultPercent: number; min: number; max: number; label: string }> = {
  1: { defaultPercent: 100, min: 0, max: 100, label: "Before any work started" },
  2: { defaultPercent: 75, min: 0, max: 75, label: "Work started, no chapter delivered" },
  3: { defaultPercent: 50, min: 0, max: 50, label: "A chapter has been delivered" },
  4: { defaultPercent: 0, min: 0, max: 0, label: "The complete report was delivered" },
};

export function defaultRefundAmount(stage: RefundStage, moneyIn: number): number {
  return Math.round((moneyIn * STAGE_RULES[stage].defaultPercent) / 100);
}

export function refundAmountBounds(stage: RefundStage, moneyIn: number): { min: number; max: number } {
  return { min: Math.round((moneyIn * STAGE_RULES[stage].min) / 100), max: Math.round((moneyIn * STAGE_RULES[stage].max) / 100) };
}

/** Hold a requested refund inside the stage's bounds (and never above the money in). */
export function clampRefund(stage: RefundStage, moneyIn: number, amount: number): number {
  const b = refundAmountBounds(stage, moneyIn);
  return Math.max(b.min, Math.min(b.max, Math.round(amount)));
}

export function percentOf(amount: number, moneyIn: number): number {
  return moneyIn > 0 ? Math.round((amount / moneyIn) * 1000) / 10 : 0;
}

/** The share of the full price the released chapters represent (decision 7). */
export function releasedChaptersShare(releasedChapters: number[]): number {
  return CHAPTER_SHARES.filter((c) => releasedChapters.includes(c.chapter)).reduce((s, c) => s + c.percent, 0);
}

/** What to pay the worker for chapters delivered before the refund = their leg × the released shares. */
export function workerPartialDefault(workerLegAmount: number, releasedChapters: number[]): number {
  return Math.round((workerLegAmount * releasedChaptersShare(releasedChapters)) / 100);
}

/** "Chapter 1", "Chapters 1 and 2", "Chapters 1, 2 and 3" — for the worker partial basis. */
export function releasedChaptersLabel(releasedChapters: number[]): string {
  const ns = [...releasedChapters].sort((a, b) => a - b);
  if (ns.length === 0) return "no chapters";
  if (ns.length === 1) return `Chapter ${ns[0]}`;
  return `Chapters ${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}`;
}
