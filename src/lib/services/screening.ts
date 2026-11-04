import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { waitUntil } from "@vercel/functions";
import { sendMail } from "@/lib/mailer";
import { siteUrl } from "@/lib/site-url";
import { getHqContact } from "@/lib/services/hq-contact";
import { screeningInviteEmail } from "@/lib/emails/screening";
import { applicationRejectedEmail } from "@/lib/emails/application-decision";
import {
  DEFAULT_EYE_COUNT,
  DEFAULT_SCREENING_BORDERLINE_MARGIN,
  DEFAULT_SCREENING_MINUTES,
  DEFAULT_SCREENING_PASS_PERCENT,
  RELEVANCE_SOURCE_COUNT,
  drawItems,
  outcomeFor,
  overallScore,
  scoreEye,
  scoreRelevance,
  sittingExpired,
  stageForOutcome,
  validateEyeItem,
  validateRelevanceItem,
  type EyeAnswer,
  type EyeItemKey,
  type RelevanceLabel,
  type RelevanceSource,
  type ScreeningKind,
} from "@/lib/screening/rules";
import { bannedConstructions, rewriteRulesLeft, scoreRewrite, validateRewriteItem } from "@/lib/screening/rewrite";
import { runRewriteRubric } from "@/lib/screening/rewrite-rubric";
import { FORMAT_INJECTOR_IDS, buildFormatTest, gradeFormatTest } from "@/lib/screening/format-test";

/**
 * The Stage-1 worker screening: the question bank, a candidate's tokened test,
 * automatic scoring and the COO's review. The rules themselves are pure
 * (`src/lib/screening/rules.ts`); this file is the database, the token and the
 * emails around them.
 *
 * The token in `/screen/{token}` is the only credential — a candidate has no
 * login until they are fully approved — so every candidate call shape-checks
 * the token first (the supervisor-package pattern) and reads by it.
 */

export class ScreeningError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ScreeningError";
  }
}

const TOKEN_RE = /^[a-f0-9]{32}$/;
export function isScreeningToken(value: string): boolean {
  return TOKEN_RE.test(value);
}

// ── Settings ─────────────────────────────────────────────────────────────────

const SETTING_KEYS = {
  passPercent: "screening_pass_percentage",
  borderlineMargin: "screening_borderline_margin",
  minutes: "screening_minutes",
  eyeCount: "screening_eye_count",
  /** The optional Claude voice rubric on the rewrite test, on/off. */
  rewriteClaude: "screening_rewrite_claude",
  /** How many formatting faults the practical plants; 0 switches the practical off. */
  formatCount: "screening_format_count",
} as const;

export interface ScreeningSettings {
  passPercent: number;
  borderlineMargin: number;
  minutes: number;
  eyeCount: number;
  rewriteClaude: boolean;
  formatCount: number;
}

export async function getScreeningSettings(): Promise<ScreeningSettings> {
  const rows = await db.setting.findMany({ where: { key: { in: Object.values(SETTING_KEYS) } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const num = (key: string, fallback: number, min: number, max: number) => {
    const n = Number(byKey.get(key));
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback;
  };
  return {
    passPercent: num(SETTING_KEYS.passPercent, DEFAULT_SCREENING_PASS_PERCENT, 1, 100),
    borderlineMargin: num(SETTING_KEYS.borderlineMargin, DEFAULT_SCREENING_BORDERLINE_MARGIN, 0, 50),
    minutes: num(SETTING_KEYS.minutes, DEFAULT_SCREENING_MINUTES, 5, 240),
    eyeCount: num(SETTING_KEYS.eyeCount, DEFAULT_EYE_COUNT, 1, 50),
    rewriteClaude: byKey.get(SETTING_KEYS.rewriteClaude) === "true",
    formatCount: num(SETTING_KEYS.formatCount, 0, 0, FORMAT_INJECTOR_IDS.length),
  };
}

export async function updateScreeningSettings(input: Partial<ScreeningSettings>): Promise<void> {
  const writes: { key: string; value: string }[] = [];
  if (input.passPercent !== undefined) writes.push({ key: SETTING_KEYS.passPercent, value: String(Math.round(input.passPercent)) });
  if (input.borderlineMargin !== undefined) writes.push({ key: SETTING_KEYS.borderlineMargin, value: String(Math.round(input.borderlineMargin)) });
  if (input.minutes !== undefined) writes.push({ key: SETTING_KEYS.minutes, value: String(Math.round(input.minutes)) });
  if (input.eyeCount !== undefined) writes.push({ key: SETTING_KEYS.eyeCount, value: String(Math.round(input.eyeCount)) });
  if (input.rewriteClaude !== undefined) writes.push({ key: SETTING_KEYS.rewriteClaude, value: input.rewriteClaude ? "true" : "false" });
  if (input.formatCount !== undefined) writes.push({ key: SETTING_KEYS.formatCount, value: String(Math.round(input.formatCount)) });
  await db.$transaction(writes.map((w) => db.setting.upsert({ where: { key: w.key }, create: w, update: { value: w.value } })));
}

// ── The bank (founder) ───────────────────────────────────────────────────────

export interface BankItem {
  id: string;
  kind: ScreeningKind;
  payload: unknown;
  answerKey: unknown;
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
}

export async function listScreeningItems(kind?: ScreeningKind): Promise<BankItem[]> {
  const rows = await db.screeningItem.findMany({
    where: kind ? { kind } : {},
    orderBy: [{ kind: "asc" }, { createdAt: "desc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as ScreeningKind,
    payload: r.payload,
    answerKey: r.answerKey,
    isActive: r.isActive,
    notes: r.notes,
    createdAt: r.createdAt,
  }));
}

export async function countActiveItems(): Promise<{ eye: number; rel: number; rewrite: number }> {
  const rows = await db.screeningItem.groupBy({
    by: ["kind"],
    where: { isActive: true },
    _count: { kind: true },
  });
  const byKind = new Map(rows.map((r) => [r.kind, r._count.kind]));
  return { eye: byKind.get("EYE") ?? 0, rel: byKind.get("REL") ?? 0, rewrite: byKind.get("REWRITE") ?? 0 };
}

export async function createScreeningItem(
  kind: ScreeningKind,
  payload: unknown,
  answerKey: unknown,
  notes: string | null,
  createdById: string
): Promise<{ id: string }> {
  const clean = cleanItem(kind, payload, answerKey);
  const row = await db.screeningItem.create({
    data: {
      kind,
      payload: clean.payload as Prisma.InputJsonValue,
      answerKey: clean.answerKey as Prisma.InputJsonValue,
      notes: notes?.trim() || null,
      createdById,
    },
    select: { id: true },
  });
  return row;
}

export async function updateScreeningItem(
  id: string,
  input: { payload?: unknown; answerKey?: unknown; notes?: string | null; isActive?: boolean }
): Promise<void> {
  const existing = await db.screeningItem.findUnique({ where: { id }, select: { kind: true, payload: true, answerKey: true } });
  if (!existing) throw new ScreeningError("No such item", 404);
  const data: Record<string, unknown> = {};
  if (input.payload !== undefined || input.answerKey !== undefined) {
    const clean = cleanItem(
      existing.kind as ScreeningKind,
      input.payload ?? existing.payload,
      input.answerKey ?? existing.answerKey
    );
    data.payload = clean.payload;
    data.answerKey = clean.answerKey;
  }
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (Object.keys(data).length === 0) return;
  await db.screeningItem.update({ where: { id }, data });
}

export async function deleteScreeningItem(id: string): Promise<void> {
  const existing = await db.screeningItem.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new ScreeningError("No such item", 404);
  await db.screeningItem.delete({ where: { id } });
}

function cleanItem(kind: ScreeningKind, payload: unknown, answerKey: unknown): { payload: unknown; answerKey: unknown } {
  try {
    if (kind === "EYE") return validateEyeItem((payload ?? {}) as never, (answerKey ?? {}) as never);
    if (kind === "REL") return validateRelevanceItem((payload ?? {}) as never, (answerKey ?? {}) as never);
    if (kind === "REWRITE") return validateRewriteItem((payload ?? {}) as never, answerKey);
    throw new ScreeningError("That question type is not available yet", 400);
  } catch (e) {
    if (e instanceof ScreeningError) throw e;
    throw new ScreeningError(e instanceof Error ? e.message : "Invalid question", 400);
  }
}

// ── Sending a test (COO/founder) ─────────────────────────────────────────────

/**
 * Draws a fresh sitting for an application and emails the candidate the link.
 * Refused unless the bank has at least one active Eye item and one active
 * relevance item — a test with nothing to answer helps no one.
 */
export async function sendScreening(applicationId: string, actorId: string): Promise<{ token: string; url: string }> {
  const application = await db.workerApplication.findUnique({
    where: { id: applicationId },
    select: { id: true, status: true, fullName: true, email: true, screening: { select: { id: true } } },
  });
  if (!application) throw new ScreeningError("No such application", 404);
  if (application.status !== "PENDING") throw new ScreeningError("Only a pending application can be screened", 409);
  if (application.screening) throw new ScreeningError("A screening test has already been sent", 409);

  const settings = await getScreeningSettings();
  const [eyePool, relPool, rewritePool] = await Promise.all([
    db.screeningItem.findMany({ where: { kind: "EYE", isActive: true }, select: { id: true } }),
    db.screeningItem.findMany({ where: { kind: "REL", isActive: true }, select: { id: true } }),
    db.screeningItem.findMany({ where: { kind: "REWRITE", isActive: true }, select: { id: true, payload: true } }),
  ]);
  if (eyePool.length === 0 || relPool.length === 0) {
    throw new ScreeningError("Add Eye-test and reference-relevance questions to the bank first", 409);
  }

  const eyeItemIds = drawItems(eyePool, settings.eyeCount).map((i) => i.id);
  const relItemId = drawItems(relPool, 1)[0]?.id ?? null;
  // The rewrite is optional: drawn only if the bank has one. Its total is the
  // count of banned constructions planted in the paragraph (recomputed at submit).
  const rewriteItem = rewritePool.length ? drawItems(rewritePool, 1)[0] : null;
  const rewriteItemId = rewriteItem?.id ?? null;
  const rewriteTotal = rewriteItem
    ? bannedConstructions(String(((rewriteItem.payload ?? {}) as { text?: string }).text ?? "")).length
    : 0;
  // The formatting practical (when switched on): a random subset of the fixed fault menu.
  const formatInjected = settings.formatCount > 0 ? drawItems(FORMAT_INJECTOR_IDS.map((id) => ({ id })), settings.formatCount).map((i) => i.id) : [];
  const token = crypto.randomBytes(16).toString("hex");

  await db.$transaction([
    db.screeningAssignment.create({
      data: {
        applicationId: application.id,
        token,
        status: "SENT",
        eyeItemIds,
        relItemId,
        rewriteItemId,
        eyeTotal: eyeItemIds.length,
        relTotal: relItemId ? RELEVANCE_SOURCE_COUNT : 0,
        rewriteTotal,
        formatInjected,
        formatTotal: formatInjected.length,
        sentById: actorId,
      },
    }),
    db.workerApplication.update({ where: { id: application.id }, data: { screeningStage: "SCREEN_SENT" } }),
  ]);

  const url = `${siteUrl()}/screen/${token}`;
  const hq = await getHqContact();
  waitUntil(
    sendMail({ to: application.email, ...screeningInviteEmail({ fullName: application.fullName, url, hq }) }).then((sent) => {
      if (sent.ok) console.info("[screening] invite email sent");
      else console.error("[screening] invite email failed:", sent.error);
    })
  );
  return { token, url };
}

// ── The candidate's test (tokened, no login) ─────────────────────────────────

export interface CandidateEyeItem {
  id: string;
  text: string;
  source: string | null;
}
export interface CandidateRelItem {
  topic: string;
  sources: RelevanceSource[];
}
export interface CandidateRewriteItem {
  text: string;
}

export interface CandidateView {
  status: "SENT" | "IN_PROGRESS" | "SUBMITTED";
  minutes: number;
  deadlineAt: Date | null;
  expired: boolean;
  eye: CandidateEyeItem[];
  rel: CandidateRelItem | null;
  rewrite: CandidateRewriteItem | null;
  /** The formatting practical: how many faults to fix, and whether a file has been uploaded. */
  format: { faults: number; uploaded: boolean } | null;
}

async function loadAssignment(token: string) {
  if (!isScreeningToken(token)) return null;
  return db.screeningAssignment.findUnique({ where: { token } });
}

function eyeItemsFor(ids: string[], items: { id: string; payload: Prisma.JsonValue }[]): CandidateEyeItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return ids
    .map((id) => byId.get(id))
    .filter((i): i is { id: string; payload: Prisma.JsonValue } => i != null)
    .map((i) => {
      const p = (i.payload ?? {}) as { text?: string; source?: string | null };
      return { id: i.id, text: String(p.text ?? ""), source: p.source ?? null };
    });
}

function relItemFor(payload: Prisma.JsonValue): CandidateRelItem {
  const p = (payload ?? {}) as { topic?: string; sources?: RelevanceSource[] };
  return { topic: String(p.topic ?? ""), sources: Array.isArray(p.sources) ? p.sources : [] };
}

/** The test as the candidate sees it — no answer keys, ever. Null when the token is unknown. */
export async function getScreeningForCandidate(token: string): Promise<CandidateView | null> {
  const a = await loadAssignment(token);
  if (!a) return null;
  const settings = await getScreeningSettings();

  const ids = [...a.eyeItemIds, ...(a.relItemId ? [a.relItemId] : []), ...(a.rewriteItemId ? [a.rewriteItemId] : [])];
  const items = await db.screeningItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, kind: true, payload: true },
  });
  const rel = a.relItemId ? items.find((i) => i.id === a.relItemId) : null;
  const rewrite = a.rewriteItemId ? items.find((i) => i.id === a.rewriteItemId) : null;
  const rewriteText = rewrite ? String(((rewrite.payload ?? {}) as { text?: string }).text ?? "") : "";

  return {
    status: a.status as CandidateView["status"],
    minutes: settings.minutes,
    deadlineAt: a.deadlineAt,
    expired: sittingExpired(a.deadlineAt),
    eye: eyeItemsFor(a.eyeItemIds, items),
    rel: rel ? relItemFor(rel.payload) : null,
    rewrite: rewrite && rewriteText ? { text: rewriteText } : null,
    format: a.formatInjected.length > 0 ? { faults: a.formatInjected.length, uploaded: a.formatCorrect != null } : null,
  };
}

/** The broken formatting-test .docx for this sitting, built on demand from the planted faults. Null when there is none. */
export async function getFormatFile(token: string): Promise<{ bytes: Buffer; filename: string } | null> {
  const a = await loadAssignment(token);
  if (!a || a.formatInjected.length === 0) return null;
  const bytes = await buildFormatTest(a.formatInjected);
  return { bytes, filename: "EduCraft formatting test.docx" };
}

/** Grades a candidate's fixed formatting document and records the result. Can be redone until they submit. */
export async function gradeFormatUpload(token: string, buffer: Uint8Array): Promise<{ received: true }> {
  const a = await loadAssignment(token);
  if (!a) throw new ScreeningError("This link is not valid", 404);
  if (a.status === "SUBMITTED") throw new ScreeningError("You have already finished this test", 409);
  if (a.formatInjected.length === 0) throw new ScreeningError("This test has no formatting part", 409);
  if (!a.startedAt) throw new ScreeningError("Start the test before uploading", 409);

  const grade = await gradeFormatTest(buffer, a.formatInjected);
  await db.screeningAssignment.updateMany({
    where: { token, status: { not: "SUBMITTED" } },
    data: {
      formatCorrect: grade.correct,
      formatTotal: grade.total,
      formatRemaining: grade.remaining as unknown as Prisma.InputJsonValue,
    },
  });
  return { received: true };
}

/** Starts the clock. Idempotent: re-starting keeps the first deadline. */
export async function startScreening(token: string): Promise<{ deadlineAt: Date }> {
  const a = await loadAssignment(token);
  if (!a) throw new ScreeningError("This link is not valid", 404);
  if (a.status === "SUBMITTED") throw new ScreeningError("You have already finished this test", 409);
  if (a.startedAt && a.deadlineAt) return { deadlineAt: a.deadlineAt };

  const settings = await getScreeningSettings();
  const now = new Date();
  const deadlineAt = new Date(now.getTime() + settings.minutes * 60_000);
  await db.screeningAssignment.updateMany({
    where: { token, startedAt: null },
    data: { status: "IN_PROGRESS", startedAt: now, deadlineAt },
  });
  const after = await db.screeningAssignment.findUnique({ where: { token }, select: { deadlineAt: true } });
  return { deadlineAt: after?.deadlineAt ?? deadlineAt };
}

export interface SubmitAnswers {
  eye: Record<string, EyeAnswer>;
  rel: Record<string, RelevanceLabel>;
  /** The candidate's rewrite of the AI paragraph (when the sitting has one). */
  rewrite?: string;
}

/**
 * Scores the sitting and records the automatic outcome. Idempotent on the
 * SUBMITTED status (a second submit is refused), so a double click cannot
 * re-score. Time is enforced on the server, but a candidate who runs over is
 * still scored on what they entered — the answers are not thrown away.
 */
export async function submitScreening(token: string, answers: SubmitAnswers): Promise<{ submitted: true }> {
  const a = await loadAssignment(token);
  if (!a) throw new ScreeningError("This link is not valid", 404);
  if (a.status === "SUBMITTED") throw new ScreeningError("You have already finished this test", 409);
  if (!a.startedAt) throw new ScreeningError("Start the test before submitting", 409);

  const ids = [...a.eyeItemIds, ...(a.relItemId ? [a.relItemId] : []), ...(a.rewriteItemId ? [a.rewriteItemId] : [])];
  const items = await db.screeningItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, kind: true, payload: true, answerKey: true },
  });
  const byId = new Map(items.map((i) => [i.id, i]));

  const eyeKeys: EyeItemKey[] = a.eyeItemIds
    .map((id) => byId.get(id))
    .filter((i): i is NonNullable<typeof i> => i != null)
    .map((i) => ({ id: i.id, isAI: Boolean((i.answerKey as { isAI?: boolean }).isAI) }));
  const eyeCorrect = scoreEye(eyeKeys, answers.eye ?? {});

  const relItem = a.relItemId ? byId.get(a.relItemId) : null;
  const relLabels = relItem ? ((relItem.answerKey as { labels?: RelevanceLabel[] }).labels ?? []) : [];
  const relCorrect = relLabels.length > 0 ? scoreRelevance(relLabels, answers.rel ?? {}) : 0;

  // Rewrite: score the candidate's recast against the paragraph's current text.
  const rewriteItem = a.rewriteItemId ? byId.get(a.rewriteItemId) : null;
  const rewriteOriginal = rewriteItem ? String(((rewriteItem.payload ?? {}) as { text?: string }).text ?? "") : "";
  const rewriteAnswer = typeof answers.rewrite === "string" ? answers.rewrite : "";
  const rewriteScore = rewriteItem ? scoreRewrite(rewriteOriginal, rewriteAnswer) : null;

  const score = overallScore({
    eyeCorrect,
    eyeTotal: eyeKeys.length,
    relCorrect,
    relTotal: relLabels.length,
    rewriteCorrect: rewriteScore?.correct ?? 0,
    rewriteTotal: rewriteScore?.total ?? 0,
    // The formatting practical is graded when the file is uploaded; read what was stored.
    formatCorrect: a.formatCorrect ?? 0,
    formatTotal: a.formatTotal ?? a.formatInjected.length,
  });
  const settings = await getScreeningSettings();
  const outcome = outcomeFor(score.overallPercent, settings.passPercent, settings.borderlineMargin);

  const claimed = await db.screeningAssignment.updateMany({
    where: { token, status: { not: "SUBMITTED" } },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      answers: answers as unknown as Prisma.InputJsonValue,
      eyeCorrect,
      eyeTotal: eyeKeys.length,
      relCorrect,
      relTotal: relLabels.length,
      rewriteCorrect: rewriteScore?.correct ?? null,
      rewriteTotal: rewriteScore?.total ?? null,
      overallPercent: score.overallPercent,
      outcome,
    },
  });
  if (claimed.count === 0) throw new ScreeningError("You have already finished this test", 409);

  await db.workerApplication.update({
    where: { id: a.applicationId },
    data: { screeningStage: stageForOutcome(outcome) },
  });

  // The optional voice rubric (off by default) runs after the response and
  // stores one advisory line for the COO — it never changes the score above.
  if (settings.rewriteClaude && rewriteItem && rewriteAnswer.trim()) {
    waitUntil(
      runRewriteRubric(rewriteOriginal, rewriteAnswer).then((line) => {
        if (line) return db.screeningAssignment.update({ where: { token }, data: { rewriteRubric: line } }).then(() => undefined);
      })
    );
  }
  return { submitted: true };
}

// ── The COO's review ─────────────────────────────────────────────────────────

export interface ReviewEyeRow {
  id: string;
  text: string;
  source: string | null;
  isAI: boolean;
  choice: "AI" | "HUMAN" | null;
  tell: string | null;
  correct: boolean;
}
export interface ReviewRelRow {
  source: RelevanceSource;
  correct: RelevanceLabel;
  chosen: RelevanceLabel | null;
  right: boolean;
}

export interface ReviewRewrite {
  original: string;
  answer: string;
  correct: number;
  total: number;
  remaining: number;
  tooShort: boolean;
  rulesLeft: { label: string; quote: string; fix: string }[];
  rubric: string | null;
}

export interface ReviewFormat {
  correct: number;
  total: number;
  uploaded: boolean;
  remaining: { id: string; ruleId: string; label: string; fix: string }[];
}

export interface ReviewDetail {
  assignmentId: string;
  applicationId: string;
  candidate: string;
  email: string;
  status: string;
  outcome: string | null;
  reviewDecision: string | null;
  overallPercent: number | null;
  eyeCorrect: number | null;
  eyeTotal: number | null;
  relCorrect: number | null;
  relTotal: number | null;
  rewriteCorrect: number | null;
  rewriteTotal: number | null;
  submittedAt: Date | null;
  topic: string | null;
  eye: ReviewEyeRow[];
  rel: ReviewRelRow[];
  rewrite: ReviewRewrite | null;
  format: ReviewFormat | null;
}

/** The submitted sittings awaiting a decision: borderline first, then clear ones for the record. */
export async function listScreeningReview(): Promise<
  {
    assignmentId: string;
    applicationId: string;
    candidate: string;
    overallPercent: number | null;
    outcome: string | null;
    reviewDecision: string | null;
    submittedAt: Date | null;
  }[]
> {
  const rows = await db.screeningAssignment.findMany({
    where: { status: "SUBMITTED" },
    orderBy: [{ submittedAt: "desc" }],
    select: {
      id: true,
      applicationId: true,
      overallPercent: true,
      outcome: true,
      reviewDecision: true,
      submittedAt: true,
      application: { select: { fullName: true } },
    },
  });
  return rows.map((r) => ({
    assignmentId: r.id,
    applicationId: r.applicationId,
    candidate: r.application.fullName,
    overallPercent: r.overallPercent,
    outcome: r.outcome,
    reviewDecision: r.reviewDecision,
    submittedAt: r.submittedAt,
  }));
}

/** One submitted sitting in full, with the tells the COO must weigh. */
export async function getScreeningReviewDetail(assignmentId: string): Promise<ReviewDetail | null> {
  const a = await db.screeningAssignment.findUnique({
    where: { id: assignmentId },
    include: { application: { select: { id: true, fullName: true, email: true } } },
  });
  if (!a) return null;

  const ids = [...a.eyeItemIds, ...(a.relItemId ? [a.relItemId] : []), ...(a.rewriteItemId ? [a.rewriteItemId] : [])];
  const items = await db.screeningItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, kind: true, payload: true, answerKey: true },
  });
  const byId = new Map(items.map((i) => [i.id, i]));
  const answers = (a.answers ?? { eye: {}, rel: {} }) as SubmitAnswers;

  const eye: ReviewEyeRow[] = a.eyeItemIds
    .map((id) => byId.get(id))
    .filter((i): i is NonNullable<typeof i> => i != null)
    .map((i) => {
      const p = (i.payload ?? {}) as { text?: string; source?: string | null };
      const isAI = Boolean((i.answerKey as { isAI?: boolean }).isAI);
      const ans = answers.eye?.[i.id] ?? null;
      const choice = ans?.choice ?? null;
      return {
        id: i.id,
        text: String(p.text ?? ""),
        source: p.source ?? null,
        isAI,
        choice,
        tell: ans?.tell ?? null,
        correct: choice != null && (choice === "AI") === isAI,
      };
    });

  const relItem = a.relItemId ? byId.get(a.relItemId) : null;
  const relPayload = relItem ? ((relItem.payload ?? {}) as { topic?: string; sources?: RelevanceSource[] }) : null;
  const relLabels = relItem ? ((relItem.answerKey as { labels?: RelevanceLabel[] }).labels ?? []) : [];
  const rel: ReviewRelRow[] = (relPayload?.sources ?? []).map((src, i) => {
    const chosen = (answers.rel?.[String(i)] as RelevanceLabel | undefined) ?? null;
    return { source: src, correct: relLabels[i], chosen, right: chosen === relLabels[i] };
  });

  const rewriteItem = a.rewriteItemId ? byId.get(a.rewriteItemId) : null;
  let rewrite: ReviewRewrite | null = null;
  if (rewriteItem) {
    const original = String(((rewriteItem.payload ?? {}) as { text?: string }).text ?? "");
    const answer = typeof answers.rewrite === "string" ? answers.rewrite : "";
    const score = scoreRewrite(original, answer);
    rewrite = {
      original,
      answer,
      correct: a.rewriteCorrect ?? score.correct,
      total: a.rewriteTotal ?? score.total,
      remaining: score.remaining,
      tooShort: score.tooShort,
      rulesLeft: answer.trim() ? rewriteRulesLeft(answer).map((r) => ({ label: r.label, quote: r.quote, fix: r.fix })) : [],
      rubric: a.rewriteRubric,
    };
  }

  const format: ReviewFormat | null =
    a.formatInjected.length > 0
      ? {
          correct: a.formatCorrect ?? 0,
          total: a.formatTotal ?? a.formatInjected.length,
          uploaded: a.formatCorrect != null,
          remaining: Array.isArray(a.formatRemaining) ? (a.formatRemaining as unknown as ReviewFormat["remaining"]) : [],
        }
      : null;

  return {
    assignmentId: a.id,
    applicationId: a.application.id,
    candidate: a.application.fullName,
    email: a.application.email,
    status: a.status,
    outcome: a.outcome,
    reviewDecision: a.reviewDecision,
    overallPercent: a.overallPercent,
    eyeCorrect: a.eyeCorrect,
    eyeTotal: a.eyeTotal,
    relCorrect: a.relCorrect,
    relTotal: a.relTotal,
    rewriteCorrect: a.rewriteCorrect,
    rewriteTotal: a.rewriteTotal,
    submittedAt: a.submittedAt,
    topic: relPayload?.topic ?? null,
    eye,
    rel,
    rewrite,
    format,
  };
}

/**
 * The COO's decision on a submitted sitting. PASS moves the application to
 * SCREEN_PASSED (the training stage is a later phase); FAIL moves it to
 * SCREEN_FAILED and declines the application with a polite email — the same
 * email a direct rejection sends.
 */
export async function decideScreening(
  assignmentId: string,
  decision: "PASS" | "FAIL",
  actorId: string,
  note?: string
): Promise<void> {
  const a = await db.screeningAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, status: true, applicationId: true, application: { select: { fullName: true, email: true, status: true } } },
  });
  if (!a) throw new ScreeningError("No such screening", 404);
  if (a.status !== "SUBMITTED") throw new ScreeningError("This test has not been submitted yet", 409);

  await db.$transaction([
    db.screeningAssignment.update({
      where: { id: assignmentId },
      data: { reviewDecision: decision, reviewedById: actorId, reviewedAt: new Date(), reviewNote: note?.trim() || null },
    }),
    db.workerApplication.update({
      where: { id: a.applicationId },
      data: {
        screeningStage: decision === "PASS" ? "SCREEN_PASSED" : "SCREEN_FAILED",
        // A fail closes the application; a pass leaves it PENDING for the
        // training stage (a later phase) and, for now, the usual approval.
        ...(decision === "FAIL"
          ? { status: "REJECTED", reviewedById: actorId, reviewedAt: new Date(), reviewNote: note?.trim() || "Did not pass screening" }
          : {}),
      },
    }),
  ]);

  if (decision === "FAIL" && a.application.status === "PENDING") {
    const hq = await getHqContact();
    const mail = applicationRejectedEmail({ fullName: a.application.fullName, role: "worker", hq });
    waitUntil(
      sendMail({ to: a.application.email, ...mail }).then((sent) => {
        if (!sent.ok) console.error("[screening] decline email failed:", sent.error);
      })
    );
  }
}

export interface ScreeningStatusLite {
  status: string;
  outcome: string | null;
  reviewDecision: string | null;
  overallPercent: number | null;
  assignmentId: string;
}

/** For the applications page: the screening state of several applications, keyed by application id. */
export async function screeningStatusMap(applicationIds: string[]): Promise<Record<string, ScreeningStatusLite>> {
  if (applicationIds.length === 0) return {};
  const rows = await db.screeningAssignment.findMany({
    where: { applicationId: { in: applicationIds } },
    select: { id: true, applicationId: true, status: true, outcome: true, reviewDecision: true, overallPercent: true },
  });
  return Object.fromEntries(
    rows.map((a) => [
      a.applicationId,
      { status: a.status, outcome: a.outcome, reviewDecision: a.reviewDecision, overallPercent: a.overallPercent, assignmentId: a.id },
    ])
  );
}

/** How many submitted sittings are waiting for a decision (for the applications-page link). */
export async function countScreeningToReview(): Promise<number> {
  return db.screeningAssignment.count({ where: { status: "SUBMITTED", reviewDecision: null } });
}
