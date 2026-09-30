/**
 * The chapter gate's rules (30 Sept 2026, founder): every chapter passes the
 * formatting system and the quality gate as a chapter, before anyone downloads
 * or approves it. The same 89 checks as the report gate, run on the chapter's
 * own Word file; the checks that need the whole report do not apply. Pure and
 * browser-safe: the service (src/lib/services/chapter-gate.ts), the
 * orchestrator's rules and the screens read it.
 *
 * - Pass bar: every check that applies to the chapter passes. Warnings never block.
 * - A failing AI chapter is rewritten with its failures in the brief, at most
 *   MAX_GATE_REWRITES times; then the draft goes to the specialist with what is left.
 * - A person's upload must pass before the COO approves it (the founder may approve anyway, with a reason).
 */

import type { QualityScore } from "./score";
import type { CheckResult, QualityItem } from "./types";

/** Bump when the chapter gate's rules change, so every chapter is checked again. */
export const CHAPTER_GATE_VERSION = "cg-1";
/** Automatic rewrites of one chapter (founder: up to 2). The Setting `chapter_check_rewrites` can lower it. */
export const MAX_GATE_REWRITES = 2;
/** Check runs that end in an error before the draft is handed over unchecked (and the founder told). */
export const MAX_CHECK_ERRORS = 3;
/** A check that has not finished in this long is taken again. */
export const CHECK_LEASE_MS = 5 * 60_000;
/** Lines of failures written into a rewrite's brief. */
export const MAX_FAILURE_LINES = 25;

/**
 * Formatting rules a new text can fix: they come from what the chapter says
 * (a fourth heading level, a table with no caption, an equation in a sentence).
 * Every other formatting rule is set by our Word builder: a failure there is
 * our defect, told to the founder, never a reason to rewrite a chapter.
 */
export const TEXT_DRIVEN_FORMATTING: ReadonlySet<string> = new Set(["H4", "P2", "P3", "T5", "FG1", "FG4", "FG5", "EQ1", "EQ3", "EQ4"]);

export function isRewritable(item: Pick<QualityItem, "id" | "layer">): boolean {
  return item.layer !== "formatting" || TEXT_DRIVEN_FORMATTING.has(item.id);
}

export interface ChapterGateResult {
  passed: boolean;
  /** Checks that apply to one chapter, and how many of them passed (a WARN counts as passed). */
  applicable: number;
  passedCount: number;
  failures: QualityItem[];
  warnings: QualityItem[];
  /** Every failure can be fixed by writing the chapter again. */
  rewritable: boolean;
  /** Our own formatting defects (ids), for the founder. */
  builderFailures: string[];
}

export function chapterGateResult(checks: CheckResult[], score: QualityScore): ChapterGateResult {
  const applicable = checks.filter((c) => c.status !== "NA");
  const failed = applicable.filter((c) => c.status === "FAIL");
  const builderFailures = [...new Set(score.failures.filter((f) => !isRewritable(f)).map((f) => f.id))];
  return {
    passed: failed.length === 0,
    applicable: applicable.length,
    passedCount: applicable.length - failed.length,
    failures: score.failures,
    warnings: score.warnings,
    rewritable: builderFailures.length === 0,
    builderFailures,
  };
}

/** The failures as the lines a rewrite's brief carries (the report gate's own format). */
export function failureLines(failures: QualityItem[], max = MAX_FAILURE_LINES): string[] {
  return failures.slice(0, max).map((f) => {
    const quote = f.locations.find((l) => l.quote)?.quote;
    return `[${f.id}] ${f.message}${quote ? ` Example: "${quote}"` : ""}${f.fix ? ` Fix: ${f.fix}` : ""}`;
  });
}

/** One line per failure or warning, for the draft's note and the cards ("Fix: …" / "Check: …"). */
export function findingLines(items: QualityItem[], kind: "fix" | "check", max = 25): string[] {
  return items.slice(0, max).map((f) => {
    const quote = f.locations.find((l) => l.quote)?.quote;
    return `${kind === "fix" ? "Fix" : "Check"}: ${f.message}${quote ? ` ("${quote.slice(0, 140)}")` : ""}${f.fix ? ` ${f.fix}` : ""}`;
  });
}

// ─── What happens next to a chapter's AI text ───────────────────────────────

export type CheckStatus = "RUNNING" | "PASSED" | "FAILED" | "ERROR";

/** A written chapter nobody has uploaded a version of yet (the AI text is what gets checked). */
export interface ChapterGateFact {
  chapter: number;
  /** The text's hash (GenerationCheckpoint.outputHash); null for a chapter written before the chapter gate. */
  outputHash: string | null;
  /** Automatic rewrites already made of this chapter. */
  rewritesUsed: number;
  /** The check of the current text, if there is one. */
  check: { status: CheckStatus; lockedUntil: Date | null; attempts: number; rewritable: boolean | null; lines: string[] } | null;
  /** Why this chapter may not be rewritten (a data pause after it, a Mode 5 dataset built from it), or null. */
  barred: string | null;
}

/**
 * Whether rewrites may happen: "now" (a live run), "later" (the project is on hold: the run
 * rewrites once it is back) or "never" (no run, a stopped or finished one: a person decides).
 */
export type RewritePolicy = "now" | "later" | "never";

export type ChapterGateStep =
  | { kind: "check" }
  | { kind: "wait" }
  | { kind: "rewrite"; lines: string[] }
  | { kind: "handover"; outcome: "passed" | "failed" | "unchecked" };

export const REWRITE_BAR_TEXT = {
  pause: (n: number) => `a data request after Chapter ${n} already exists, and a new text would bring its blanks back`,
  dataset: "the Mode 5 dataset was built from this chapter",
} as const;

/** Why a chapter may not be rewritten automatically, or null. */
export function rewriteBar(f: { chapter: number; mode: number | null; pauses: { afterChapter: number; status: string }[]; hasDataset: boolean }): string | null {
  if (f.pauses.some((p) => p.afterChapter === f.chapter && p.status !== "CANCELLED")) return REWRITE_BAR_TEXT.pause(f.chapter);
  if (f.mode === 5 && f.chapter === 3 && f.hasDataset) return REWRITE_BAR_TEXT.dataset;
  return null;
}

/**
 * The one rule for a chapter's AI text: check it, wait for its check, rewrite it,
 * or hand the draft to the specialist. The orchestrator acts on it; the draft is
 * only made once it says "handover".
 */
export function chapterGateStep(f: ChapterGateFact, ctx: { now: Date; maxRewrites: number; policy: RewritePolicy }): ChapterGateStep {
  const c = f.outputHash ? f.check : null;
  if (!c) return { kind: "check" };
  if (c.status === "RUNNING") return c.lockedUntil && c.lockedUntil.getTime() > ctx.now.getTime() ? { kind: "wait" } : { kind: "check" };
  if (c.status === "ERROR") return c.attempts >= MAX_CHECK_ERRORS ? { kind: "handover", outcome: "unchecked" } : { kind: "check" };
  if (c.status === "PASSED") return { kind: "handover", outcome: "passed" };
  const canRewrite = c.rewritable !== false && !f.barred && f.rewritesUsed < ctx.maxRewrites;
  if (!canRewrite || ctx.policy === "never") return { kind: "handover", outcome: "failed" };
  return ctx.policy === "now" ? { kind: "rewrite", lines: c.lines } : { kind: "wait" };
}

/** The first written chapter, lowest number first, whose AI text is not settled yet (null = every one is handed over). */
export function nextGateStep(facts: ChapterGateFact[], ctx: { now: Date; maxRewrites: number; policy: RewritePolicy }): { chapter: number; step: Exclude<ChapterGateStep, { kind: "handover" }> } | null {
  for (const f of [...facts].sort((a, b) => a.chapter - b.chapter)) {
    const step = chapterGateStep(f, ctx);
    if (step.kind !== "handover") return { chapter: f.chapter, step };
  }
  return null;
}

/** The Setting `chapter_check_rewrites` ("0" switches automatic rewrites off), at most MAX_GATE_REWRITES. */
export function rewritesAllowed(setting: string | null | undefined): number {
  const n = Number(setting);
  return setting == null || setting === "" || !Number.isFinite(n) ? MAX_GATE_REWRITES : Math.max(0, Math.min(MAX_GATE_REWRITES, Math.floor(n)));
}

export const REWRITES_SETTING = "chapter_check_rewrites";

const HELD = new Set(["ON_HOLD", "DISPUTED", "AWAITING_CLIENT_INPUT", "NEW", "DOWNPAYMENT_VERIFIED", "REQUIREMENTS_CONFIRMED", "ASSIGNED"]);
const WORKING = new Set(["IN_PROGRESS", "REVISION_NEEDED"]);

/** Whether a rewrite can come: a live run on a project being worked on, or later once the project is back. */
export function rewritePolicy(run: { status: string } | null, projectStatus: string): RewritePolicy {
  if (!run || run.status === "STOPPED" || run.status === "COMPLETE") return "never";
  if (WORKING.has(projectStatus)) return "now";
  return HELD.has(projectStatus) ? "later" : "never";
}

/** A check as the Documents cards show it (no costs for the specialist). */
export interface CheckView {
  status: CheckStatus;
  passedCount: number | null;
  applicable: number | null;
  failures: { id: string; message: string; fix: string | null; quote: string | null }[];
  warnings: { id: string; message: string; fix: string | null; quote: string | null }[];
  error: string | null;
  settledAt: string | null;
  costNaira?: number | null;
}

export function checkView(row: { status: CheckStatus; passedCount: number | null; applicable: number | null; failures: unknown; warnings: unknown; error: string | null; settledAt: Date | null; costNaira?: number | null }, withCost: boolean): CheckView {
  const slim = (json: unknown, max: number) =>
    (Array.isArray(json) ? (json as QualityItem[]) : []).slice(0, max).map((f) => ({ id: f.id, message: f.message, fix: f.fix, quote: f.locations?.find((l) => l.quote)?.quote ?? null }));
  return {
    status: row.status,
    passedCount: row.passedCount,
    applicable: row.applicable,
    failures: slim(row.failures, 25),
    warnings: slim(row.warnings, 12),
    error: row.error,
    settledAt: row.settledAt ? row.settledAt.toISOString() : null,
    ...(withCost ? { costNaira: row.costNaira ?? null } : {}),
  };
}

/** Where a chapter's AI text stands, for its card: being checked, being rewritten, or settled (its check). */
export interface AiTextView {
  stage: "checking" | "rewriting" | "settled";
  rewritesUsed: number;
  check: CheckView | null;
}

/** The facts the orchestrator, the draft and the cards read, for one chapter's AI text. */
export function gateFactFrom(a: {
  chapter: number;
  outputHash: string | null;
  gateRewriteNo: number;
  check: { status: CheckStatus; lockedUntil: Date | null; attempts: number; rewritable: boolean | null; failures: unknown } | null;
  mode: number | null;
  pauses: { afterChapter: number; status: string }[];
  hasDataset: boolean;
}): ChapterGateFact {
  return {
    chapter: a.chapter,
    outputHash: a.outputHash,
    rewritesUsed: a.gateRewriteNo,
    check: a.check
      ? { status: a.check.status, lockedUntil: a.check.lockedUntil, attempts: a.check.attempts, rewritable: a.check.rewritable, lines: failureLines(Array.isArray(a.check.failures) ? (a.check.failures as QualityItem[]) : []) }
      : null,
    barred: rewriteBar({ chapter: a.chapter, mode: a.mode, pauses: a.pauses, hasDataset: a.hasDataset }),
  };
}

