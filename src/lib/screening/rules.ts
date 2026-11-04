/**
 * Stage-1 worker screening: the rules and every sentence a candidate reads.
 *
 * Pure — no database, no browser, no Claude — so `check:screening`, the
 * candidate pages and the grading service share one definition of "correct",
 * "scored" and "passed". The question banks (`ScreeningItem`) and a candidate's
 * instance (`ScreeningAssignment`) live in the database; this file only scores
 * them and holds the wording.
 *
 * The self-scoring tests: the Eye test (spot AI), reference relevance (classify
 * sources) and the rewrite test (recast an AI-sounding paragraph, scored by the
 * voice scan — see `rewrite.ts`, kept apart so this file stays free of the
 * quality-layer import). The formatting practical (which leans on the chapter
 * gate) is a later phase; its `kind` is reserved here so the bank and the stage
 * machine do not have to change when it lands.
 */

export const SCREENING_KINDS = ["EYE", "REL", "REWRITE", "FORMAT"] as const;
export type ScreeningKind = (typeof SCREENING_KINDS)[number];

/** The stages an application moves through once the screening pipeline is opted into. */
export const SCREENING_STAGES = [
  "SCREEN_SENT",
  "SCREEN_IN_PROGRESS",
  "SCREEN_PASSED",
  "SCREEN_FAILED",
  // Reserved for later phases (training + the final practical).
  "TRAINING",
  "FINAL_TEST",
  "FINAL_PASSED",
  "FINAL_FAILED",
] as const;
export type ScreeningStage = (typeof SCREENING_STAGES)[number];

/** The four-way reference relevance labels, matching the research Tier-2 classification. */
export const RELEVANCE_LABELS = ["CORE", "CLOSELY_RELATED", "TANGENTIAL", "IRRELEVANT"] as const;
export type RelevanceLabel = (typeof RELEVANCE_LABELS)[number];

export function isRelevanceLabel(v: unknown): v is RelevanceLabel {
  return typeof v === "string" && (RELEVANCE_LABELS as readonly string[]).includes(v);
}

export const RELEVANCE_LABEL_TEXT: Record<RelevanceLabel, string> = {
  CORE: "Core",
  CLOSELY_RELATED: "Closely related",
  TANGENTIAL: "Tangential",
  IRRELEVANT: "Irrelevant",
};

// ── Defaults (Settings may override) ─────────────────────────────────────────

/** How many Eye-test paragraphs a sitting draws. */
export const DEFAULT_EYE_COUNT = 12;
/** Sources in a reference-relevance item. */
export const RELEVANCE_SOURCE_COUNT = 10;
/** Overall pass mark, in percent. */
export const DEFAULT_SCREENING_PASS_PERCENT = 70;
/** Below `pass - margin` is a clear fail; in between is borderline (COO review). */
export const DEFAULT_SCREENING_BORDERLINE_MARGIN = 10;
/** Minutes a candidate has once they start. */
export const DEFAULT_SCREENING_MINUTES = 40;

// ── Scoring ──────────────────────────────────────────────────────────────────

export interface EyeItemKey {
  id: string;
  /** The paragraph was written by AI. */
  isAI: boolean;
}

export interface EyeAnswer {
  /** The candidate's call. */
  choice: "AI" | "HUMAN";
  /** Free text: the tell they named. Stored for the COO, never auto-scored. */
  tell?: string;
}

/** Correct Eye answers out of the items drawn. An unanswered item scores nothing. */
export function scoreEye(items: readonly EyeItemKey[], answers: Readonly<Record<string, EyeAnswer>>): number {
  return items.filter((it) => {
    const a = answers[it.id];
    if (!a) return false;
    return (a.choice === "AI") === it.isAI;
  }).length;
}

/** Correct relevance classifications out of the sources. `answers[i]` is the label for source i. */
export function scoreRelevance(
  correct: readonly RelevanceLabel[],
  answers: Readonly<Record<string, RelevanceLabel>>
): number {
  return correct.filter((label, i) => answers[String(i)] === label).length;
}

export interface ScreeningScore {
  eyeCorrect: number;
  eyeTotal: number;
  relCorrect: number;
  relTotal: number;
  /** The rewrite test (0 of each when the bank has no rewrite paragraph). */
  rewriteCorrect: number;
  rewriteTotal: number;
  /** Every question weighted the same. */
  overallPercent: number;
}

/**
 * Combines the tests into one percentage, each question weighted equally. The
 * rewrite is optional — its correct/total default to 0, so a sitting without a
 * rewrite paragraph scores exactly as it did before the test existed.
 */
export function overallScore(input: {
  eyeCorrect: number;
  eyeTotal: number;
  relCorrect: number;
  relTotal: number;
  rewriteCorrect?: number;
  rewriteTotal?: number;
}): ScreeningScore {
  const rewriteCorrect = input.rewriteCorrect ?? 0;
  const rewriteTotal = input.rewriteTotal ?? 0;
  const total = input.eyeTotal + input.relTotal + rewriteTotal;
  const correct = input.eyeCorrect + input.relCorrect + rewriteCorrect;
  const overallPercent = total > 0 ? Math.round((correct / total) * 100) : 0;
  return {
    eyeCorrect: input.eyeCorrect,
    eyeTotal: input.eyeTotal,
    relCorrect: input.relCorrect,
    relTotal: input.relTotal,
    rewriteCorrect,
    rewriteTotal,
    overallPercent,
  };
}

export type ScreeningOutcome = "PASS" | "FAIL" | "BORDERLINE";

/**
 * The automatic verdict from the overall percent. At or above the pass mark is
 * a clear pass; below the pass mark minus the margin is a clear fail; the band
 * in between is borderline and goes to the COO, who also weighs the "name the
 * tell" answers a machine cannot score.
 */
export function outcomeFor(
  overallPercent: number,
  passPercent: number = DEFAULT_SCREENING_PASS_PERCENT,
  margin: number = DEFAULT_SCREENING_BORDERLINE_MARGIN
): ScreeningOutcome {
  const bar = clampPercent(passPercent, DEFAULT_SCREENING_PASS_PERCENT);
  const m = Number.isFinite(margin) && margin >= 0 ? margin : DEFAULT_SCREENING_BORDERLINE_MARGIN;
  if (overallPercent >= bar) return "PASS";
  if (overallPercent < bar - m) return "FAIL";
  return "BORDERLINE";
}

function clampPercent(v: number, fallback: number): number {
  return Number.isFinite(v) && v >= 1 && v <= 100 ? Math.round(v) : fallback;
}

/** The stage an auto outcome lands on (BORDERLINE stays in progress, awaiting the COO). */
export function stageForOutcome(outcome: ScreeningOutcome): ScreeningStage {
  if (outcome === "PASS") return "SCREEN_PASSED";
  if (outcome === "FAIL") return "SCREEN_FAILED";
  return "SCREEN_IN_PROGRESS";
}

/**
 * Picks `count` ids at random from a pool, using an injected rng so the check
 * script can pin it. Fewer than `count` available returns all of them.
 */
export function drawItems<T extends { id: string }>(pool: readonly T[], count: number, rand: () => number = Math.random): T[] {
  const out = pool.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, Math.max(0, count));
}

/** Whether a sitting has run out of time. A null deadline never expires. */
export function sittingExpired(deadlineAt: Date | string | null, now: Date = new Date()): boolean {
  if (deadlineAt == null) return false;
  const d = typeof deadlineAt === "string" ? new Date(deadlineAt) : deadlineAt;
  return now.getTime() > d.getTime();
}

// ── Validation of a founder's bank item ──────────────────────────────────────

export class ScreeningRuleError extends Error {}

/** Checks an Eye item the founder is saving: a paragraph and which way it was written. */
export function validateEyeItem(payload: { text?: unknown; source?: unknown }, answerKey: { isAI?: unknown }): {
  payload: { text: string; source: string | null };
  answerKey: { isAI: boolean };
} {
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (text.length < 40) throw new ScreeningRuleError("The paragraph is too short");
  if (text.length > 4000) throw new ScreeningRuleError("The paragraph is too long");
  if (typeof answerKey.isAI !== "boolean") throw new ScreeningRuleError("Mark whether it was written by AI");
  const source = typeof payload.source === "string" && payload.source.trim() ? payload.source.trim() : null;
  return { payload: { text, source }, answerKey: { isAI: answerKey.isAI } };
}

export interface RelevanceSource {
  title: string;
  authors?: string | null;
  year?: number | null;
  journal?: string | null;
  abstract?: string | null;
}

/** Checks a reference-relevance item: a topic, ten sources, and a label for each. */
export function validateRelevanceItem(
  payload: { topic?: unknown; sources?: unknown },
  answerKey: { labels?: unknown }
): { payload: { topic: string; sources: RelevanceSource[] }; answerKey: { labels: RelevanceLabel[] } } {
  const topic = typeof payload.topic === "string" ? payload.topic.trim() : "";
  if (topic.length < 5) throw new ScreeningRuleError("The topic is too short");
  const rawSources = Array.isArray(payload.sources) ? payload.sources : [];
  if (rawSources.length !== RELEVANCE_SOURCE_COUNT) {
    throw new ScreeningRuleError(`A relevance item needs exactly ${RELEVANCE_SOURCE_COUNT} sources`);
  }
  const rawLabels = Array.isArray(answerKey.labels) ? answerKey.labels : [];
  if (rawLabels.length !== RELEVANCE_SOURCE_COUNT || !rawLabels.every(isRelevanceLabel)) {
    throw new ScreeningRuleError("Label every source Core, Closely related, Tangential or Irrelevant");
  }
  const sources: RelevanceSource[] = rawSources.map((s) => {
    const src = (s ?? {}) as Record<string, unknown>;
    const title = typeof src.title === "string" ? src.title.trim() : "";
    if (!title) throw new ScreeningRuleError("Every source needs a title");
    return {
      title,
      authors: typeof src.authors === "string" && src.authors.trim() ? src.authors.trim() : null,
      year: typeof src.year === "number" && Number.isFinite(src.year) ? Math.round(src.year) : null,
      journal: typeof src.journal === "string" && src.journal.trim() ? src.journal.trim() : null,
      abstract: typeof src.abstract === "string" && src.abstract.trim() ? src.abstract.trim() : null,
    };
  });
  return { payload: { topic, sources }, answerKey: { labels: rawLabels as RelevanceLabel[] } };
}

// ── Wording ──────────────────────────────────────────────────────────────────

/** Every sentence a candidate reads during the screening. No internal jargon. */
export const SCREENING_TEXT = {
  introTitle: "EduCraft worker screening",
  introBody:
    "This short test checks the judgement every EduCraft writer needs: spotting AI-written text, and telling a strong academic source from a weak one. It is not timed until you begin, so read this first.",
  timeNote: (minutes: number) => `Once you start you have ${minutes} minutes. Do it in one sitting, on your own.`,
  startLabel: "Start the test",
  resumeNote: "You have already started — the clock is running.",
  expired: "Your time is up. Your answers have been submitted as they stood.",
  alreadyDone: "You have finished this test. Thank you — we will be in touch.",
  notFound: "This link is not valid. Check that you copied the whole link, or ask EduCraft for a new one.",

  eyeTitle: "Part 1 — Spot the AI",
  eyeBody:
    "Each paragraph below was written either by a person or by AI. For each one, say which you think it is, and in a few words say what gave it away.",
  eyeChoiceAI: "Written by AI",
  eyeChoiceHuman: "Written by a person",
  eyeTellLabel: "What gave it away?",
  eyeTellPlaceholder: "In a few words…",

  relTitle: "Part 2 — Judge the sources",
  relBody:
    "Here is a project topic and ten sources a student might cite. For each source, say how relevant it is to the topic.",
  relTopicLabel: "The project topic",

  rewriteTitle: "Part 3 — Rewrite it in your own voice",
  rewriteBody:
    "The paragraph below reads like it was written by AI. Rewrite it the way a careful student would: plain, specific and direct, keeping the meaning but losing the stock phrases, filler and hype. Do not simply shorten it.",
  rewriteParagraphLabel: "The paragraph to rewrite",
  rewriteAnswerLabel: "Your rewrite",
  rewritePlaceholder: "Write your version here…",

  submitLabel: "Submit my answers",
  submitting: "Submitting…",
  answerAll: "Answer every question before submitting.",
  submitError: "That did not go through. Check your connection and try again.",
  doneTitle: "All done",
  doneBody: "Thank you for taking the EduCraft screening. We will review your answers and be in touch by email.",

  /** The one line in the invitation email. */
  emailSubject: "Your EduCraft worker screening",
  emailLine:
    "Thank you for applying to write with EduCraft. The next step is a short screening test. Open the link below to take it — it is not timed until you press start.",
} as const;
