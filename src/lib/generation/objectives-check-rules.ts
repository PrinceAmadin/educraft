/**
 * The independent check of a report's aim and objectives (founder, 30 Sept
 * 2026): the same model as the drafter (Claude Opus 5.5 writes and reviews),
 * in a fresh, blind call with its own examiner prompt that never sees the
 * drafter's prompt or reasoning and is not told the objectives were drafted
 * by AI, scores them 0–100 on
 * Related, Strong and Achievable. The card shows three teal rings; low scores
 * warn and never block approval.
 *
 * Pure (browser-safe): the wording sent to the judge (OBJECTIVES_CHECK_TEXT,
 * for the founder's review), the key that tells whether a stored check still
 * matches what is on the card, the reply's validation, the bands and the
 * state the card shows. The call itself is objectives-judge.ts.
 */

import type { ResearchModeNumber } from "@/lib/generation/department-map";

export const OBJECTIVES_CHECK_TEXT = {
  system:
    "You are an experienced external examiner for final year projects at Nigerian universities. You are given a project title, the student's department, degree programme and research method, and the aim and objectives proposed for the project. Judge them as an examiner would at the proposal defence.\n\n" +
    "Score three things from 0 to 100:\n" +
    "- RELATED: how directly they serve what this title promises. Together they should cover every part of the title, and nothing should drift to a different topic.\n" +
    "- STRONG: how well they are written as a research aim and objectives: specific to this title rather than generic to any project of this kind, measurable, each led by a clear action verb, not overlapping, in a logical order, with the aim stated as one sentence and the final objective delivering what the aim promises, and right for the degree level.\n" +
    "- ACHIEVABLE: how realistic they are for one Nigerian final-year undergraduate in a single semester, using the stated research method and the data, tools and access such a student can get.\n\n" +
    "Use these bands for all three:\n" +
    "90–100: an examiner would accept it as it stands.\n" +
    "75–89: sound, with minor wording or scope changes.\n" +
    "60–74: a real weakness the student would be asked to fix.\n" +
    "40–59: a serious problem.\n" +
    "Below 40: wrong for this project.\n\n" +
    "How to score:\n" +
    "- Be critical and do not inflate. A typical acceptable set lands in the 70s and 80s; keep 90 and above for work you would not change.\n" +
    "- First score the aim and each objective on its own, with a one-sentence reason naming the specific strength or problem. Where a row scores below 75 on any of the three, give a suggestion: a rewritten version or a precise change. Otherwise leave the suggestion empty.\n" +
    "- Then score the set as a whole. The set scores are your judgement of the aim and objectives together (coverage of the title, progression, overlap), not an average of the rows.\n" +
    "- If no aim is given, score the objectives only, give the aim row zero scores with the reason \"No aim stated\", and say so in the summary.\n" +
    "- Write a summary of one or two sentences for the supervisor.\n" +
    "- Judge only what you are given. Make no assumption about who wrote it or how.\n\n" +
    "Call the record_objectives_check tool once with every score. No other output.",
  tool: "Record the scores for the aim, each objective and the set as a whole.",
  /** The judge's own description of each research method (not the drafter's). */
  modes: {
    1: "Mode 1, desk-based: argues from published literature and sources, with no data collection.",
    2: "Mode 2, survey: collects primary data from people with questionnaires and analyses it statistically.",
    3: "Mode 3, build: designs, implements and tests a working system, prototype or application.",
    4: "Mode 4, laboratory: runs physical experiments or tests and analyses the measurements.",
    5: "Mode 5, secondary data: analyses existing published datasets or records quantitatively, with no primary data collection.",
  } satisfies Record<ResearchModeNumber, string>,
} as const;

export interface ObjectivesCheckInput {
  title: string;
  department: string;
  degree: string;
  modeNumber: ResearchModeNumber;
  aim: string | null;
  objectives: string[];
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** The judge's user message: the project and what is proposed, nothing else. */
export function checkUserPrompt(input: ObjectivesCheckInput): string {
  return [
    `PROJECT TITLE: ${clean(input.title)}`,
    `DEPARTMENT: ${clean(input.department)}`,
    `DEGREE: ${clean(input.degree)}`,
    `RESEARCH METHOD: ${OBJECTIVES_CHECK_TEXT.modes[input.modeNumber]}`,
    "",
    "PROPOSED AIM:",
    clean(input.aim) || "None stated.",
    "",
    "PROPOSED OBJECTIVES:",
    ...input.objectives.map((o, i) => `${i + 1}. ${clean(o)}`),
  ].join("\n");
}

/**
 * What a stored check was made for: FNV-1a over the normalised inputs. The
 * card computes it live from the form, so a hand edit (or a new mode or
 * department) marks the check stale at once.
 */
export function objectivesCheckKey(input: ObjectivesCheckInput): string {
  const text = JSON.stringify([
    clean(input.title).toLowerCase(),
    clean(input.department).toLowerCase(),
    clean(input.degree).toLowerCase(),
    input.modeNumber,
    clean(input.aim),
    input.objectives.map(clean),
  ]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export interface CheckScores {
  related: number;
  strong: number;
  achievable: number;
}

export interface CheckRow extends CheckScores {
  /** 0 = the aim; 1..n = the objectives in order. */
  index: number;
  reason: string;
  suggestion: string | null;
}

export interface StoredObjectivesCheck {
  status: "done" | "failed";
  /** The model that answered (a refusal fallback may differ from the one asked). */
  model: string | null;
  checkedAt: string;
  inputKey: string;
  overall: (CheckScores & { summary: string }) | null;
  rows: CheckRow[];
  costNaira: number;
  error: string | null;
}

export const MAX_REASON_CHARS = 240;
// Opus often writes three sentences for the supervisor; 400 cut them mid-word on production.
const MAX_SUMMARY_CHARS = 700;

function score(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n);
}

function text(v: unknown, max: number): string {
  const t = clean(typeof v === "string" ? v : "");
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function scores(v: unknown): CheckScores | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const related = score(o.related);
  const strong = score(o.strong);
  const achievable = score(o.achievable);
  return related === null || strong === null || achievable === null ? null : { related, strong, achievable };
}

export type CheckReply = { ok: true; overall: CheckScores & { summary: string }; rows: CheckRow[] } | { ok: false; problems: string[] };

/**
 * The judge's reply as rows the card can show: the set's scores and summary,
 * the aim row (index 0) and one row per objective (1..n, each exactly once).
 * Scores are whole numbers 0–100; reasons at most 240 characters.
 */
export function validateCheckReply(raw: unknown, objectiveCount: number): CheckReply {
  const r = (raw ?? {}) as Record<string, unknown>;
  const problems: string[] = [];
  const overallScores = scores(r.overall);
  const summary = text((r.overall as Record<string, unknown> | undefined)?.summary, MAX_SUMMARY_CHARS);
  if (!overallScores) problems.push("The set's three scores must be whole numbers from 0 to 100.");
  if (!summary) problems.push("The summary is missing.");

  const rows: CheckRow[] = [];
  const aimScores = scores(r.aim);
  const aimRow = (r.aim ?? {}) as Record<string, unknown>;
  if (!aimScores) problems.push("The aim's three scores must be whole numbers from 0 to 100.");
  else rows.push({ index: 0, ...aimScores, reason: text(aimRow.reason, MAX_REASON_CHARS), suggestion: text(aimRow.suggestion, MAX_REASON_CHARS * 2) || null });

  const list = Array.isArray(r.objectives) ? (r.objectives as Record<string, unknown>[]) : [];
  if (list.length !== objectiveCount) problems.push(`Score every objective exactly once (${objectiveCount} expected, ${list.length} given).`);
  const seen = new Set<number>();
  for (const o of list) {
    const n = score(o?.number);
    const s = scores(o);
    if (n === null || n < 1 || n > objectiveCount || seen.has(n)) {
      problems.push(`An objective row has a missing, repeated or unknown number (${String(o?.number)}).`);
      continue;
    }
    if (!s) {
      problems.push(`Objective ${n}'s three scores must be whole numbers from 0 to 100.`);
      continue;
    }
    seen.add(n);
    rows.push({ index: n, ...s, reason: text(o.reason, MAX_REASON_CHARS), suggestion: text(o.suggestion, MAX_REASON_CHARS * 2) || null });
  }
  rows.sort((a, b) => a.index - b.index);
  if (problems.length) return { ok: false, problems };
  return { ok: true, overall: { ...overallScores!, summary }, rows };
}

export const WEAK_BELOW = 60;
export const STRONG_FROM = 80;

/** The word under a ring: Strong 80+, Fair 60–79, Weak under 60. */
export function scoreBand(n: number): "Strong" | "Fair" | "Weak" {
  return n >= STRONG_FROM ? "Strong" : n >= WEAK_BELOW ? "Fair" : "Weak";
}

/** A row the card flags in gold: any of its three scores under 60. */
export function isWeakRow(row: CheckScores): boolean {
  return Math.min(row.related, row.strong, row.achievable) < WEAK_BELOW;
}

export type CheckState = "none" | "running" | "done" | "stale" | "failed";

/** What the card shows for the check, given what is on the card now (its key). */
export function checkState(check: StoredObjectivesCheck | null, lockedUntil: Date | string | null, currentKey: string | null, now = Date.now()): CheckState {
  if (lockedUntil && new Date(lockedUntil).getTime() > now) return "running";
  if (!check) return "none";
  if (check.status === "failed") return "failed";
  return currentKey && check.inputKey !== currentKey ? "stale" : "done";
}

/** Reads a stored check back (a JSON column); null when it is missing or unreadable. */
export function readStoredCheck(v: unknown): StoredObjectivesCheck | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Partial<StoredObjectivesCheck>;
  if ((c.status !== "done" && c.status !== "failed") || typeof c.inputKey !== "string" || typeof c.checkedAt !== "string") return null;
  return {
    status: c.status,
    model: typeof c.model === "string" ? c.model : null,
    checkedAt: c.checkedAt,
    inputKey: c.inputKey,
    overall: c.overall ?? null,
    rows: Array.isArray(c.rows) ? c.rows : [],
    costNaira: typeof c.costNaira === "number" ? c.costNaira : 0,
    error: typeof c.error === "string" ? c.error : null,
  };
}
