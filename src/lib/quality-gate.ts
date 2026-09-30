/**
 * Phase D8 — the quality gate. Scores a generated report on 89 checks before a
 * human sees it: Layer 1 formatting (71 rules, no AI), Layer 2a voice (1),
 * Layer 2b reference verification (1) and Layer 3 structure (16). At 85 or more
 * with no CRITICAL failure the report goes to the QA queue on its own, and the
 * specialist has 30 minutes to recall it. When it fails, the founder or the COO
 * can re-generate one chapter with its failures written into the brief.
 *
 * Results live on the project's QaReview row (no separate model). The AI
 * results are kept per chapter, keyed by the chapter's text, so a second run
 * pays only for the chapters that changed.
 */

import { Prisma, type ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { callClaudeForJson } from "@/lib/anthropic";
import { AssemblyError, loadAssemblyInput, reportFileName } from "@/lib/assembly/assemble";
import { runPreliminaryPagesAgent } from "@/lib/services/preliminary-pages";
import { knownCommonCitation } from "@/lib/quality/known-citations";
import { lookupDepartment } from "@/lib/generation/department-map";
import { approvedChapterInput } from "@/lib/generation/approved-inputs";
import { startChapterGeneration, GenerationError } from "@/lib/generation/generate-chapter";
import { scheduleGenerationStep } from "@/lib/generation/generation-runner";
import { pausePointsFor } from "@/lib/generation/dynamic-data-form";
import type { ChapterNumber } from "@/lib/generation/prompt-loader";
import { getApprovedModeSettings } from "@/lib/services/research-mode";
import { getApprovedBrief } from "@/lib/research/source-stage-actions";
import { notifyOperations, notifyUsers } from "@/lib/services/notifications";
import { submitGeneratedReport } from "@/lib/services/deliverables";
import { projectReviewState } from "@/lib/services/chapter-review";
import { CHAPTER_REVIEW_TEXT } from "@/lib/chapter-review";
import { transitionProject, TransitionError } from "@/lib/services/projects";
import { SECONDARY_DATA_CATEGORY } from "@/lib/services/secondary-data";
import type { GateReference } from "@/lib/quality/citation-check";
import { AI_CACHE_VERSION, CHAPTER_CHECK_STEPS, QUALITY_SUBSYSTEM, aiResultsFrom, chapterAiTasks, pool, sha32, type AiByChapter, type StoredSupportSet, type StoredVoice } from "@/lib/quality/chapter-ai";
import { readTraceability, TRACE_TOOL, type TraceabilityResult } from "@/lib/quality/structural-checks";
import { finishReport, prepareReport } from "@/lib/quality/evaluate";
import { plainText } from "@/lib/quality/prose";
import { QUALITY_TOTAL, PASS_MARK, type QualityScore } from "@/lib/quality/score";
import { recallState, recallWindowEnd, RECALL_REFUSAL, RECALL_WINDOW_MINUTES, type RecallState } from "@/lib/quality/recall";
import { QUALITY_TEXT } from "@/lib/quality/text";
import type { CheckResult, QualityItem } from "@/lib/quality/types";

// ─── Known common citations (FIX 2), shared with the chapter read-back ───────

export { KNOWN_COMMON_CITATIONS, knownCommonCitation, type KnownCitation } from "@/lib/quality/known-citations";

// ─── Errors and shapes ───────────────────────────────────────────────────────

export { QUALITY_SUBSYSTEM, CHAPTER_CHECK_STEPS };
const RUN_LEASE_MS = 5 * 60_000;
const AI_CONCURRENCY = 4;
const HISTORY_KEPT = 10;

export class QualityGateError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export interface QualityActor {
  userId: string;
  name: string;
  /** "WORKER" when the assigned specialist ran it; otherwise the executive's role. */
  role: string;
}

interface StoredReport {
  version: 1;
  ranAt: string;
  ranBy: string;
  checks: CheckResult[];
  warnings: QualityItem[];
  notes: string[];
  costNaira: number;
  ai: AiByChapter & { trace: { hash: string; result: TraceabilityResult } | null };
  history: { at: string; score: number; passed: boolean; autoSubmitted: boolean; by: string; regenerated?: number }[];
}

export interface QualityRunResponse {
  projectId: string;
  status: ProjectStatus;
  qualityScore: number;
  totalChecks: number;
  percent: number;
  passMark: number;
  passed: boolean;
  criticalFailures: number;
  formattingScore: number;
  structuralScore: number;
  referenceScore: number;
  voiceScore: number;
  failuresJson: QualityItem[];
  warnings: QualityItem[];
  checks: { id: string; layer: string; title: string; severity: string; status: string; summary: string }[];
  notes: string[];
  autoSubmitted: boolean;
  autoSubmitError: string | null;
  autoSubmittedAt: string | null;
  recallWindowExpiresAt: string | null;
  recall: RecallState;
  costNaira: number | null;
  ranAt: string | null;
  ranBy: string | null;
  history: StoredReport["history"];
}

const WAT = (d: Date) => d.toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" });

function readStored(json: Prisma.JsonValue | null | undefined): StoredReport | null {
  const r = json as unknown as StoredReport | null;
  return r && r.version === 1 ? r : null;
}

// ─── Running the gate ────────────────────────────────────────────────────────

/**
 * Scores the project's generated report and saves the result on QaReview. At
 * 85/89 with no CRITICAL failure, a project still being worked on goes to the
 * QA queue with the assembled file as its complete-document version.
 */
export async function runQualityGate(projectDbId: string, actor: QualityActor, opts: { rebuild?: boolean } = {}): Promise<QualityRunResponse> {
  const project = await db.project.findUnique({
    where: { id: projectDbId },
    select: { id: true, projectId: true, status: true, workerId: true, projectTitle: true, departmentOutline: true, worker: { select: { userId: true } } },
  });
  if (!project) throw new QualityGateError("Project not found", 404, "NOT_FOUND");

  // One run at a time: a lease on the QaReview row, taken by compare-and-set.
  await db.qaReview.upsert({ where: { projectId: project.id }, create: { projectId: project.id }, update: {} });
  const started = new Date();
  const lease = new Date(started.getTime() + RUN_LEASE_MS);
  const got = await db.qaReview.updateMany({
    where: { projectId: project.id, OR: [{ qualityRunLockedUntil: null }, { qualityRunLockedUntil: { lt: started } }] },
    data: { qualityRunLockedUntil: lease },
  });
  if (got.count === 0) throw new QualityGateError("A quality check is already running on this report.", 409, "QUALITY_RUN_IN_PROGRESS");

  try {
    return await runLocked(project, actor, started, opts);
  } finally {
    await db.qaReview.updateMany({ where: { projectId: project.id, qualityRunLockedUntil: lease }, data: { qualityRunLockedUntil: null } }).catch(() => undefined);
  }
}

async function runLocked(
  project: { id: string; projectId: string; status: ProjectStatus; workerId: string | null; projectTitle: string | null; departmentOutline: string | null; worker: { userId: string | null } | null },
  actor: QualityActor,
  started: Date,
  opts: { rebuild?: boolean },
): Promise<QualityRunResponse> {
  let input;
  try {
    // Chapter review: the gate scores the approved uploads where there are some (the AI text elsewhere),
    // and only a report whose every chapter is approved can go to QA.
    input = await loadAssemblyInput(project.id, { source: "canonical" });
  } catch (error) {
    if (error instanceof AssemblyError) throw new QualityGateError(error.message, error.status, error.code, error.details);
    throw error;
  }
  // D7b: the acknowledgement, abstract and list of abbreviations are written before the report is
  // scored, so the gate checks them and the copy sent to QA is the copy it scored. Free when nothing
  // changed or the pages were edited by hand; an agent failure leaves the D7 placeholders and never blocks.
  if (input.includePrelims) {
    const pages = await runPreliminaryPagesAgent(project.id);
    if (pages) input = { ...input, preliminary: { acknowledgement: pages.acknowledgement, abstract: pages.abstract, abbreviations: pages.abbreviations, needsReview: pages.needsReview } };
  }
  const [settings, brief, refRows, checkpoints, review, chapterChecks] = await Promise.all([
    getApprovedModeSettings(project.id).catch(() => null),
    getApprovedBrief(db, project.id).catch(() => null),
    db.reference.findMany({
      where: { projectId: project.id, status: "KEPT" },
      select: { id: true, title: true, proposedTitle: true, authors: true, year: true, journal: true, abstract: true, classification: true },
    }),
    db.generationCheckpoint.findMany({ where: { projectId: project.id }, select: { chapterNumber: true, plan: true } }),
    db.qaReview.findUnique({ where: { projectId: project.id }, select: { qualityReport: true } }),
    // The chapter gate's AI results: a chapter it already checked costs this run nothing.
    db.chapterCheck.findMany({ where: { projectId: project.id, NOT: { ai: { equals: Prisma.DbNull } } }, select: { ai: true } }),
  ]);
  const previous = readStored(review?.qualityReport);
  const references: GateReference[] = refRows.map((r) => ({ ...r, classification: r.classification ?? null }));
  const entry = lookupDepartment(settings?.department ?? input.department);
  const title = input.title;
  const department = settings?.department ?? input.department;
  const objectives = brief?.objectives ?? [];

  // ── The free layers: Layer 1, the citation matching, the phrase scan ──
  const prepared = await prepareReport({ input, references, knownCommon: knownCommonCitation, primarySources: brief?.sources });
  const { match, paragraphs, scan, template } = prepared;

  // ── The AI calls, per chapter, reusing what an unchanged chapter already has ──
  const ai: StoredReport["ai"] = { voice: {}, support: {}, trace: null, errors: [] };
  const usage = (step: string, chapterNumber?: number) => ({ projectId: project.id, subsystem: QUALITY_SUBSYSTEM, step, ...(chapterNumber ? { chapterNumber } : {}) });
  const knownVoice = new Map<string, StoredVoice>();
  const knownSupport = new Map<string, StoredSupportSet>();
  for (const row of chapterChecks) {
    const a = row.ai as { voice?: StoredVoice | null; support?: StoredSupportSet | null } | null;
    if (a?.voice?.hash) knownVoice.set(a.voice.hash, a.voice);
    if (a?.support?.hash) knownSupport.set(a.support.hash, a.support);
  }
  for (const v of Object.values(previous?.ai.voice ?? {})) knownVoice.set(v.hash, v);
  for (const v of Object.values(previous?.ai.support ?? {})) knownSupport.set(v.hash, v);
  const tasks: (() => Promise<void>)[] = [];

  for (const ch of input.chapters) {
    tasks.push(
      ...chapterAiTasks({
        projectDbId: project.id,
        projectCode: project.projectId,
        title,
        department,
        chapter: ch,
        paragraphs,
        scan,
        match,
        reuseVoice: (hash) => knownVoice.get(hash) ?? null,
        reuseSupport: (hash) => knownSupport.get(hash) ?? null,
        out: ai,
        usage: { subsystem: QUALITY_SUBSYSTEM, voiceStep: "voice", supportStep: "citation_support" },
      }),
    );
  }

  // ST9: objective traceability, one call over the results chapter(s) and Chapter Five.
  const resultsChapters = (template === "B" ? [3, 4] : [4]).map((n) => input.chapters.find((c) => c.number === n)).filter((c): c is { number: number; text: string } => !!c);
  const conclusion = input.chapters.find((c) => c.number === 5);
  if (objectives.length > 0 && conclusion && resultsChapters.length === (template === "B" ? 2 : 1)) {
    const resultsText = resultsChapters.map((c) => plainText(c.text)).join("\n\n").slice(0, 60_000);
    const conclusionText = plainText(conclusion.text).slice(0, 30_000);
    const traceHash = sha32(`${AI_CACHE_VERSION}|trace|${objectives.join("|")}|${resultsText}|${conclusionText}`);
    if (previous?.ai.trace?.hash === traceHash) ai.trace = previous.ai.trace;
    else {
      tasks.push(async () => {
        try {
          const raw = await callClaudeForJson<unknown>({
            system: QUALITY_TEXT.traceSystem,
            user: QUALITY_TEXT.traceUser({
              title,
              objectives: objectives.map((o, i) => `${i + 1}. ${o}`).join("\n"),
              resultsLabel: template === "B" ? "Chapters Three and Four (the thematic chapters)" : "Chapter Four",
              results: resultsText,
              conclusion: conclusionText,
            }),
            toolName: TRACE_TOOL.name,
            toolDescription: TRACE_TOOL.description,
            inputSchema: TRACE_TOOL.input_schema as unknown as Record<string, unknown>,
            maxTokens: 3000,
            usage: usage("objective_trace"),
          });
          ai.trace = { hash: traceHash, result: readTraceability(raw, objectives, resultsText, conclusionText) };
        } catch (error) {
          ai.errors.push(`Objective traceability review failed: ${(error as Error).message}`);
        }
      });
    }
  }

  await pool(tasks, AI_CONCURRENCY);

  // ── Score all 89 ──
  const { checks, score } = finishReport(
    prepared,
    { ...aiResultsFrom(ai, references), traceability: ai.trace?.result ?? null, errors: ai.errors },
    {
      aim: brief?.aim ?? null,
      objectives,
      pureScience: Boolean(entry?.pureScience),
      supervisorToc: Boolean(project.departmentOutline?.trim()),
      plans: new Map(input.chapters.map((c) => [c.number, planOf(checkpoints.find((k) => k.chapterNumber === c.number)?.plan)])),
    },
  );
  const cost = await db.aiUsageLog
    .aggregate({ where: { projectId: project.id, subsystem: QUALITY_SUBSYSTEM, step: { notIn: Object.values(CHAPTER_CHECK_STEPS) }, createdAt: { gte: started } }, _sum: { costNaira: true } })
    .then((r) => Math.round((r._sum.costNaira ?? 0) * 100) / 100)
    .catch(() => 0);

  // Chapter review: nothing but COO-approved uploads (with no correction outstanding) reaches QA.
  const chapterReview = await projectReviewState(project.id);
  const approvedReport = !chapterReview.applies || (chapterReview.allSettled && input.source === "approved");
  const inProgress = project.status === "IN_PROGRESS" || project.status === "REVISION_NEEDED";
  const afterQa = project.status === "APPROVED" || project.status === "BALANCE_VERIFIED" || project.status === "DELIVERED" || project.status === "SUPERVISOR_CORRECTIONS";
  const canSubmit = score.passed && approvedReport && Boolean(project.workerId) && (inProgress || (opts.rebuild === true && afterQa));
  // A report that passes while chapters still wait for approval is not sent: the note says which.
  const reviewNotes = score.passed && !approvedReport && inProgress ? [CHAPTER_REVIEW_TEXT.notAllApproved(chapterReview.pending)] : [];
  const stored: StoredReport = {
    version: 1,
    ranAt: started.toISOString(),
    ranBy: actor.name,
    checks: checks.map((c) => ({ ...c, issues: c.issues.slice(0, 40) })),
    warnings: score.warnings,
    notes: [...prepared.report.notes, ...ai.errors, ...reviewNotes],
    costNaira: cost,
    ai,
    history: [{ at: started.toISOString(), score: score.qualityScore, passed: score.passed, autoSubmitted: false, by: actor.name }, ...(previous?.history ?? [])].slice(0, HISTORY_KEPT),
  };
  await saveResults(project.id, score, stored, actor, started);

  let autoSubmitError: string | null = null;
  if (canSubmit) {
    try {
      await submitGeneratedReport({
        projectDbId: project.id,
        buffer: prepared.buffer,
        fileName: reportFileName(input.title, project.projectId),
        note: `Quality check: ${score.qualityScore} of ${QUALITY_TOTAL} checks passed.${input.builtFrom ? ` ${CHAPTER_REVIEW_TEXT.finalBuilt}` : ""}`,
        actorUserId: actor.userId,
        builtFrom: input.builtFrom ?? null,
        moveToQa: inProgress,
      });
      // A rebuild after QA is recorded for release; there is no recall window and no move.
      if (!inProgress) return getQualityReport(project.id, { autoSubmitError: null, includeCost: actor.role !== "WORKER" });
      const at = new Date();
      const until = recallWindowEnd(at);
      stored.history[0].autoSubmitted = true;
      await saveWithRetry(() =>
        db.qaReview.update({
          where: { projectId: project.id },
          data: { autoSubmittedAt: at, recallWindowExpiresAt: until, recalledAt: null, recalledById: null, qualityReport: stored as unknown as Prisma.InputJsonValue },
        }),
      );
      await notifyUsers([project.worker?.userId], {
        title: QUALITY_TEXT.autoSubmittedTitle(project.projectId),
        message: QUALITY_TEXT.autoSubmittedMessage({ code: project.projectId, score: score.qualityScore, total: QUALITY_TOTAL, until: WAT(until) }),
        type: "success",
        link: `/worker/projects/${project.projectId}?tab=report`,
      });
    } catch (error) {
      autoSubmitError = (error as Error).message;
      console.error(`[quality] ${project.projectId}: passed but could not be sent to QA`, error);
    }
  }
  return getQualityReport(project.id, { autoSubmitError, includeCost: actor.role !== "WORKER" });
}

function planOf(json: Prisma.JsonValue | null | undefined): { targetWords: number; sections: { number: string; heading: string }[] } | null {
  const p = json as { targetWords?: number; sections?: { number: string; heading: string }[] } | null;
  return p && typeof p.targetWords === "number" && Array.isArray(p.sections) ? { targetWords: p.targetWords, sections: p.sections } : null;
}

/** A few tries for a write that must not be lost (the AI results in it are already paid for); the last error is thrown. */
async function saveWithRetry<T>(write: () => Promise<T>): Promise<T> {
  const waits = [1000, 3000, 6000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await write();
    } catch (error) {
      if (attempt >= waits.length) throw error;
      console.warn("[quality] save failed, retrying", (error as Error).message);
      await new Promise((r) => setTimeout(r, waits[attempt]));
    }
  }
}

async function saveResults(projectDbId: string, score: QualityScore, stored: StoredReport, actor: QualityActor, at: Date): Promise<void> {
  const layerFailed = (layer: string) => stored.checks.some((c) => c.layer === layer && c.status === "FAIL");
  await saveWithRetry(() => db.qaReview.update({
    where: { projectId: projectDbId },
    data: {
      formattingScore: score.formattingScore,
      structuralScore: score.structuralScore,
      referenceScore: score.referenceScore,
      voiceScore: score.voiceScore,
      structuralPass: !layerFailed("structural"),
      referenceVerPass: !layerFailed("reference"),
      voiceCheckPass: !layerFailed("voice"),
      qualityScore: score.qualityScore,
      qualityTotal: score.totalChecks,
      qualityPassed: score.passed,
      failuresJson: score.failures as unknown as Prisma.InputJsonValue,
      qualityReport: stored as unknown as Prisma.InputJsonValue,
      qualityRunAt: at,
      qualityRunById: actor.userId,
    },
  }));
}

// ─── Reading the result ──────────────────────────────────────────────────────

/** The latest result as the run returned it (null fields before the first run). */
export async function getQualityReport(projectDbId: string, opts: { autoSubmitError?: string | null; includeCost?: boolean } = {}): Promise<QualityRunResponse> {
  const project = await db.project.findUnique({
    where: { id: projectDbId },
    select: {
      projectId: true,
      status: true,
      qaReview: {
        select: {
          qualityScore: true,
          qualityTotal: true,
          qualityPassed: true,
          formattingScore: true,
          structuralScore: true,
          referenceScore: true,
          voiceScore: true,
          failuresJson: true,
          qualityReport: true,
          qualityRunAt: true,
          autoSubmittedAt: true,
          recallWindowExpiresAt: true,
          recalledAt: true,
        },
      },
    },
  });
  if (!project) throw new QualityGateError("Project not found", 404, "NOT_FOUND");
  const q = project.qaReview;
  const stored = readStored(q?.qualityReport);
  const score = q?.qualityScore ?? 0;
  const failures = (q?.failuresJson as unknown as QualityItem[] | null) ?? [];
  return {
    projectId: project.projectId,
    status: project.status,
    qualityScore: score,
    totalChecks: q?.qualityTotal ?? QUALITY_TOTAL,
    percent: Math.round((score / QUALITY_TOTAL) * 1000) / 10,
    passMark: PASS_MARK,
    passed: Boolean(q?.qualityPassed),
    criticalFailures: failures.filter((f) => f.severity === "CRITICAL").map((f) => f.id).filter((id, i, a) => a.indexOf(id) === i).length,
    formattingScore: q?.formattingScore ?? 0,
    structuralScore: q?.structuralScore ?? 0,
    referenceScore: q?.referenceScore ?? 0,
    voiceScore: q?.voiceScore ?? 0,
    failuresJson: failures,
    warnings: stored?.warnings ?? [],
    checks: (stored?.checks ?? []).map((c) => ({ id: c.id, layer: c.layer, title: c.title, severity: c.severity, status: c.status, summary: c.summary })),
    notes: stored?.notes ?? [],
    autoSubmitted: Boolean(q?.autoSubmittedAt && q.qualityRunAt && q.autoSubmittedAt >= q.qualityRunAt),
    autoSubmitError: opts.autoSubmitError ?? null,
    autoSubmittedAt: q?.autoSubmittedAt?.toISOString() ?? null,
    recallWindowExpiresAt: q?.recallWindowExpiresAt?.toISOString() ?? null,
    recall: recallState({ status: project.status, autoSubmittedAt: q?.autoSubmittedAt ?? null, recallWindowExpiresAt: q?.recallWindowExpiresAt ?? null, recalledAt: q?.recalledAt ?? null }),
    costNaira: opts.includeCost === false ? null : (stored?.costNaira ?? null),
    ranAt: q?.qualityRunAt?.toISOString() ?? null,
    ranBy: stored?.ranBy ?? null,
    history: stored?.history ?? [],
  };
}

// ─── Recall ──────────────────────────────────────────────────────────────────

/** Pulls an auto-submitted report back out of the QA queue within the 30-minute window. */
export async function recallFromQa(projectDbId: string, actor: QualityActor): Promise<{ status: ProjectStatus; recalledAt: string }> {
  const project = await db.project.findUnique({
    where: { id: projectDbId },
    select: { id: true, projectId: true, status: true, qaReview: { select: { autoSubmittedAt: true, recallWindowExpiresAt: true, recalledAt: true } } },
  });
  if (!project) throw new QualityGateError("Project not found", 404, "NOT_FOUND");
  const facts = { status: project.status, autoSubmittedAt: project.qaReview?.autoSubmittedAt ?? null, recallWindowExpiresAt: project.qaReview?.recallWindowExpiresAt ?? null, recalledAt: project.qaReview?.recalledAt ?? null };
  const state = recallState(facts);
  if (state !== "OPEN") {
    const refusal = RECALL_REFUSAL[state];
    throw new QualityGateError(refusal.message, 409, refusal.code, { recallWindowExpiresAt: facts.recallWindowExpiresAt?.toISOString() ?? null });
  }
  try {
    const moved = await transitionProject(project.id, "IN_PROGRESS", { changedById: actor.userId, note: `Recalled from QA by ${actor.name}` });
    await notifyOperations({
      title: QUALITY_TEXT.recalledTitle(project.projectId),
      message: QUALITY_TEXT.recalledMessage({ code: project.projectId, by: actor.name }),
      type: "info",
      link: `/admin/projects/${project.projectId}?tab=report`,
    });
    return { status: moved.status, recalledAt: new Date().toISOString() };
  } catch (error) {
    // A reviewer started, or the window closed, between the check and the move: the state machine refused it.
    if (error instanceof TransitionError) {
      const again = recallState({ ...facts, status: (await db.project.findUnique({ where: { id: project.id }, select: { status: true } }))?.status ?? facts.status });
      const refusal = again === "OPEN" ? { code: "RECALL_FAILED", message: error.message } : RECALL_REFUSAL[again];
      throw new QualityGateError(refusal.message, 409, refusal.code);
    }
    throw error;
  }
}

// ─── Re-generating one chapter with its failures ─────────────────────────────

const MAX_FAILURE_LINES = 25;

/** The failure lines a chapter's re-generation carries (its own failures from the latest run, at most 25). */
export function failureLinesForChapter(failures: QualityItem[], chapter: number): string[] {
  return failures
    .filter((f) => f.chapter === chapter || f.locations.some((l) => l.chapter === chapter))
    .slice(0, MAX_FAILURE_LINES)
    .map((f) => {
      const quote = f.locations.find((l) => l.chapter === chapter && l.quote)?.quote;
      return `[${f.id}] ${f.message}${quote ? ` Example: "${quote}"` : ""}${f.fix ? ` Fix: ${f.fix}` : ""}`;
    });
}

/** The research questions and hypotheses the chapter's first run was given (read back from its frozen brief). */
export function briefStatements(briefText: string | null | undefined, heading: "Research questions:" | "Hypotheses:"): string[] {
  if (!briefText) return [];
  const lines = briefText.split("\n");
  const at = lines.findIndex((l) => l.trim() === heading);
  if (at === -1) return [];
  const out: string[] = [];
  for (const l of lines.slice(at + 1)) {
    const m = /^\d+\.\s+(.*)$/.exec(l.trim());
    if (!m) break;
    out.push(m[1]);
  }
  return out;
}

export async function regenerateChapterForQuality(
  projectDbId: string,
  chapter: number,
  actor: QualityActor,
): Promise<{ chapter: number; checkpointId: string; failuresSent: string[]; warning: string | null }> {
  const project = await db.project.findUnique({
    where: { id: projectDbId },
    select: { id: true, projectId: true, status: true, qaReview: { select: { failuresJson: true, qualityReport: true } } },
  });
  if (!project) throw new QualityGateError("Project not found", 404, "NOT_FOUND");
  if (project.status === "SUBMITTED" || project.status === "IN_QA_REVIEW") {
    throw new QualityGateError("The report is in the QA queue. Recall it first (within 30 minutes), or wait for the QA decision.", 409, "IN_QA");
  }
  if (project.status !== "IN_PROGRESS" && project.status !== "REVISION_NEEDED") {
    throw new QualityGateError("Chapters can be re-generated only while the report is being worked on.", 409, "NOT_IN_PROGRESS");
  }
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > 5) throw new QualityGateError("Pick a chapter from 1 to 5.", 400, "BAD_CHAPTER");
  const failures = (project.qaReview?.failuresJson as unknown as QualityItem[] | null) ?? [];
  const lines = failureLinesForChapter(failures, chapter);
  if (!lines.length) throw new QualityGateError(`The latest quality check found no failure in Chapter ${chapter}. Run the check again first.`, 409, "NO_FAILURES_FOR_CHAPTER");

  const [settings, previous, dataset] = await Promise.all([
    getApprovedModeSettings(project.id),
    db.generationCheckpoint.findUnique({ where: { projectId_chapterNumber: { projectId: project.id, chapterNumber: chapter } }, select: { briefText: true } }),
    db.projectFile.count({ where: { projectId: project.id, category: SECONDARY_DATA_CATEGORY, deletedAt: null } }),
  ]);
  if (settings.mode === 5 && chapter === 3 && dataset > 0) {
    throw new QualityGateError("Chapter 3 of a Mode 5 report cannot be re-generated once its secondary data has been fetched: the dataset was read from it.", 409, "DEPENDENT_DATASET");
  }
  const warning = pausePointsFor(settings.mode).includes(chapter)
    ? `The client's data request was drafted from Chapter ${chapter}. Check that the new chapter still matches the data they sent.`
    : null;

  const prompt = await approvedChapterInput(project.id, chapter as ChapterNumber, {
    researchQuestions: briefStatements(previous?.briefText, "Research questions:"),
    hypotheses: briefStatements(previous?.briefText, "Hypotheses:"),
  });
  let checkpoint;
  try {
    checkpoint = await startChapterGeneration({ project: project.id, prompt, requestedById: actor.userId, replace: true, qualityFailures: lines });
  } catch (error) {
    if (error instanceof GenerationError) throw new QualityGateError(error.message, 409, error.code === "HUMAN_VERSION_EXISTS" ? "HUMAN_VERSION_EXISTS" : "GENERATION_REFUSED");
    throw error;
  }
  // The chapter exists from here on. If handing it to the runner fails (a timeout), it is carried
  // on by the orchestrator's next tick, or when its progress is next opened: not an error.
  await scheduleGenerationStep(checkpoint.id).catch((error) =>
    console.warn("[quality gate] the re-generated chapter was not handed to the runner yet", checkpoint.id, error instanceof Error ? error.message : error),
  );

  const stored = readStored(project.qaReview?.qualityReport);
  if (stored) {
    stored.history = [{ at: new Date().toISOString(), score: stored.history[0]?.score ?? 0, passed: false, autoSubmitted: false, by: actor.name, regenerated: chapter }, ...stored.history].slice(0, HISTORY_KEPT);
    await db.qaReview.update({ where: { projectId: project.id }, data: { qualityReport: stored as unknown as Prisma.InputJsonValue } });
  }
  return { chapter, checkpointId: checkpoint.id, failuresSent: lines, warning };
}

export { RECALL_WINDOW_MINUTES };
