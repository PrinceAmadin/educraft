/**
 * Phase D2 — generates one chapter as a resumable background job.
 *
 *   start   startChapterGeneration: assembles the D1 prompt, freezes it with
 *           the project brief on a GenerationCheckpoint row (PENDING).
 *   step 1  OUTLINING: one call plans the chapter's sections with word
 *           targets (the plan tool); the sections are packed into parts.
 *   step 2+ WRITING: one call per part, streamed. The text is saved every
 *           few thousand characters (draftText) so progress is live; a
 *           finished part is appended to partialOutput.
 *   end     COMPLETED: fullOutput holds the chapter. FAILED: retries ran out
 *           or the error cannot be retried; partialOutput keeps the parts
 *           already written and retryChapterGeneration carries on from the
 *           part that failed.
 *
 * Steps are driven by generation-runner.ts (lease, time slices, retries).
 * Every step is compare-and-set on the status and part it read, so a step
 * replayed by a second runner can never apply twice.
 *
 * The output stays internal: nothing here reaches a client. The finished
 * report becomes a normal document version at assembly (D7).
 */
import { Prisma, type GenerationCheckpoint, type GenerationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { costUsd, usdToNairaRate } from "@/lib/ai-usage-log";
import { ClaudeStreamError, streamClaude, type ClaudeEffort, type ClaudeStreamInput, type ClaudeStreamResult, type ClaudeTextBlock } from "@/lib/anthropic";
import type { ClaudeUsage } from "@/lib/anthropic-stream";
import { loadChapterPrompt, type ChapterPromptInput } from "./prompt-loader";
import { matchDepartment, resolveSection } from "./department-map";
import { ModeNotApprovedError, lockApprovedMode, type ApprovedModeSettings } from "@/lib/services/research-mode";
import { getApprovedBrief, type ApprovedBrief } from "@/lib/research/source-stage-actions";
import { toPromptPrimarySources } from "./approved-inputs";
import { pausesBeforeChapter } from "./dynamic-data-form";
import { attachmentRefs, loadDataAttachments, pauseDataForChapter, type AttachmentRef } from "@/lib/services/data-pause";
import {
  PART_SEPARATOR,
  PLAN_TOOL,
  PLAN_TOOL_NAME,
  PlanError,
  buildChapterBrief,
  buildPlan,
  cleanPartText,
  computeProgress,
  countWords,
  missingHeadings,
  nonAnswerReason,
  outlineUserBlocks,
  parsePlanInput,
  partMaxTokens,
  partUnits,
  partUserBlocks,
  splitAgentReport,
  stepEstimateMs,
  unitHeadingNumber,
  type ChapterPlan,
} from "./chapter-plan";

export const GENERATION_SUBSYSTEM = "chapter_generation";
const CACHE: ClaudeTextBlock["cache_control"] = { type: "ephemeral" };
const OUTLINE_MAX_TOKENS = 16_000;
/** Save the streaming part this often (characters, or seconds when text is slow). */
const DRAFT_SAVE_CHARS = 6000;
const DRAFT_SAVE_MS = 8000;

export const ACTIVE_STATUSES: GenerationStatus[] = ["PENDING", "OUTLINING", "WRITING"];

/** `fatal`: retrying cannot help (a refusal, a bad request, a broken plan in the prompt). */
export class GenerationError extends Error {
  constructor(
    message: string,
    readonly fatal = false,
  ) {
    super(message);
  }
}

export interface GenerationOptions {
  /** Claude's effort for every call of the run; omitted = the API default (high). */
  effort?: ClaudeEffort;
  /** Tests only, ignored in production: throw before writing this part (0-based). "fatal" fails at once; "transient" goes through the retries. */
  simulateFailure?: { atPart: number; kind: "fatal" | "transient" };
}

export interface StepContext {
  /** Epoch ms after which no Claude call of this step may still be running. */
  deadline: number;
}

/**
 * Thrown before a step starts when it would not finish before the slice's
 * deadline. Not a failure: the runner hands the run to a fresh invocation,
 * which has the full time.
 */
export class YieldToNextSlice extends Error {
  constructor() {
    super("Not enough time left in this invocation for the next step");
  }
}

/** Seconds of slack kept after a step's estimate, for its saves and logging. */
const STEP_MARGIN_MS = 10_000;

function yieldIfNoTime(ctx: StepContext, estimateMs: number): void {
  if (Date.now() + estimateMs + STEP_MARGIN_MS > ctx.deadline) throw new YieldToNextSlice();
}

/** A few tries for a write that must not be lost (1 s, then 3 s apart); the last error is thrown. */
async function saveWithRetry<T>(write: () => Promise<T>): Promise<T> {
  const waits = [1000, 3000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await write();
    } catch (error) {
      if (attempt >= waits.length) throw error;
      console.warn("[generation] save failed, retrying", error);
      await new Promise((r) => setTimeout(r, waits[attempt]));
    }
  }
}

// ─── Starting a run ─────────────────────────────────────────────────────────

export interface StartChapterInput {
  /** Project.id or its EC-XXXXX code. */
  project: string;
  prompt: ChapterPromptInput;
  requestedById?: string | null;
  options?: GenerationOptions;
  /** Replace an existing run of this chapter (finished, failed or stopped). Refused while one is running. */
  replace?: boolean;
}

/**
 * Assembles and freezes the chapter's prompt and creates its checkpoint. Does
 * not run anything: the caller schedules the first step (scheduleGenerationStep).
 */
export async function startChapterGeneration(input: StartChapterInput) {
  const project = await db.project.findFirst({
    where: { OR: [{ id: input.project }, { projectId: input.project }] },
    select: { id: true, projectId: true },
  });
  if (!project) throw new GenerationError("Project not found", true);

  const chapter = input.prompt.chapter;
  const earlier = input.prompt.fromEarlierChapters ?? {};
  const objectives = (earlier.objectives ?? []).map((o) => o.trim()).filter(Boolean);
  // Founder's rule: the objectives come from the approved research step, never invented inside a chapter.
  if (objectives.length === 0) throw new GenerationError("The approved objectives are missing: they come from the research step, and every chapter is written to them.", true);
  const title = input.prompt.project.projectTitle?.trim();
  if (!title) throw new GenerationError("The project needs a title before chapters are generated.", true);

  const assembled = await loadChapterPrompt(input.prompt);
  const briefText = buildChapterBrief({
    chapter,
    projectTitle: title,
    university: input.prompt.project.university,
    department: assembled.department,
    template: assembled.template,
    thematicTitles: input.prompt.thematicTitles,
    objectives,
    researchQuestions: earlier.researchQuestions,
    hypotheses: earlier.hypotheses,
    specialInstructions: input.prompt.project.specialInstructions,
    supervisorToc: input.prompt.project.supervisorToc,
  });
  const promptMeta = {
    department: assembled.department,
    section: assembled.section,
    mode: input.prompt.mode,
    template: assembled.template,
    referencingStyle: assembled.referencingStyle,
    citationPlacement: assembled.citationPlacement,
    blocksUsed: assembled.blocksUsed,
    fallback: assembled.fallback,
    approxTokens: assembled.approxTokens,
    references: input.prompt.references.length,
  };

  try {
    return await db.$transaction(async (tx) => {
      // D3: no chapter without the COO's approved mode, and never in another mode or section.
      // This locks the project row, so a reopen of the mode waits for (or is refused by) this start.
      let approved: ApprovedModeSettings;
      try {
        approved = await lockApprovedMode(tx, project.id);
      } catch (error) {
        if (error instanceof ModeNotApprovedError) throw new GenerationError(error.message, true);
        throw error;
      }
      if (approved.mode !== input.prompt.mode) {
        throw new GenerationError(`This chapter was asked for in Mode ${input.prompt.mode}, but the COO approved Mode ${approved.mode}.`, true);
      }
      const approvedEntry = matchDepartment(approved.department)?.entry;
      const approvedSection = approvedEntry ? resolveSection(approvedEntry, approved.mode, approved.sectionOverride) : null;
      if (assembled.section !== approvedSection) {
        throw new GenerationError(`This chapter would use the ${assembled.section} section, but the COO approved ${approvedSection ?? "a different department"}.`, true);
      }
      // D3b: exactly the approved objectives (same words, same order) and exactly the approved cases or archival sources.
      let brief: ApprovedBrief;
      try {
        brief = await getApprovedBrief(tx, project.id);
      } catch (error) {
        if (error instanceof ModeNotApprovedError) throw new GenerationError(error.message, true);
        throw error;
      }
      const given = earlier.objectives ?? [];
      if (given.length !== brief.objectives.length || given.some((o, i) => o !== brief.objectives[i])) {
        throw new GenerationError("These objectives are not the ones the COO approved. Every chapter uses the approved objectives word for word.", true);
      }
      if (JSON.stringify(input.prompt.primarySources ?? null) !== JSON.stringify(toPromptPrimarySources(brief) ?? null)) {
        throw new GenerationError(`These ${brief.kind === "ARCHIVE" ? "archival sources" : "cases"} are not the ones the COO approved.`, true);
      }
      // D3c: a chapter after a data pause needs exactly the data the worker sent there (its PDFs and images ride with every call).
      const needed = pausesBeforeChapter(approved.mode, chapter);
      const stored = await pauseDataForChapter(tx, project.id, approved.mode, chapter);
      if (stored.length < needed.length) {
        const missing = needed.filter((n) => !stored.some((d) => d.afterChapter === n));
        throw new GenerationError(`Chapter ${chapter} needs the worker's data from the pause after Chapter ${missing.join(" and ")}, which has not been sent.`, true);
      }
      if (JSON.stringify(input.prompt.workerData ?? []) !== JSON.stringify(stored)) {
        throw new GenerationError("This data is not the data the worker sent at the pause.", true);
      }
      const attachments = await attachmentRefs(tx, project.id, stored);

      const existing = await tx.generationCheckpoint.findUnique({
        where: { projectId_chapterNumber: { projectId: project.id, chapterNumber: chapter } },
        select: { id: true, status: true, lockedUntil: true },
      });
      if (existing) {
        const running = ACTIVE_STATUSES.includes(existing.status) && existing.lockedUntil && existing.lockedUntil > new Date();
        if (running) throw new GenerationError(`Chapter ${chapter} is being generated now.`, true);
        if (!input.replace) {
          throw new GenerationError(
            existing.status === "COMPLETED"
              ? `Chapter ${chapter} has already been generated. Regenerating replaces it.`
              : `Chapter ${chapter} already has a run (${existing.status.toLowerCase()}). Resume it or replace it.`,
            true,
          );
        }
        await tx.generationCheckpoint.delete({ where: { id: existing.id } });
      }
      return tx.generationCheckpoint.create({
        data: {
          projectId: project.id,
          chapterNumber: chapter,
          promptText: assembled.text,
          briefText,
          promptMeta: promptMeta as Prisma.InputJsonValue,
          options: (input.options ?? {}) as Prisma.InputJsonValue,
          requestedById: input.requestedById ?? null,
          ...(attachments.length ? { attachments: attachments as unknown as Prisma.InputJsonValue } : {}),
        },
        select: SNAPSHOT_SELECT,
      });
    }, { timeout: 20_000, maxWait: 10_000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new GenerationError(`Chapter ${chapter} was started by someone else just now.`, true);
    }
    throw error;
  }
}

/** A FAILED run carries on from the part that failed (parts already written are kept). Returns false if it was not FAILED. */
export async function retryChapterGeneration(checkpointId: string): Promise<boolean> {
  const row = await db.generationCheckpoint.findUnique({ where: { id: checkpointId }, select: { status: true, plan: true } });
  if (!row || row.status !== "FAILED") return false;
  const res = await db.generationCheckpoint.updateMany({
    where: { id: checkpointId, status: "FAILED" },
    data: { status: row.plan ? "WRITING" : "OUTLINING", failedSteps: 0, errorMessage: null, lastError: null, lockedUntil: null, draftText: null, lastStepAt: new Date() },
  });
  return res.count > 0;
}

// ─── One step ───────────────────────────────────────────────────────────────

/**
 * Does exactly one unit of work (the plan, or one part) and returns. Throws on
 * failure; the runner decides whether to retry. `done` = nothing left for a
 * runner to do (finished, failed, or the row was replaced mid-step).
 */
export async function advanceChapterGeneration(checkpointId: string, ctx: StepContext): Promise<{ done: boolean }> {
  const cp = await db.generationCheckpoint.findUnique({ where: { id: checkpointId } });
  if (!cp) return { done: true };
  switch (cp.status) {
    case "PENDING": {
      const started = await db.generationCheckpoint.updateMany({
        where: { id: cp.id, status: "PENDING" },
        data: { status: "OUTLINING", startedAt: cp.startedAt ?? new Date(), progressPercent: computeProgress({ status: "OUTLINING", previous: cp.progressPercent }) },
      });
      if (started.count === 0) return { done: false };
      return planChapter({ ...cp, status: "OUTLINING" }, ctx);
    }
    case "OUTLINING":
      return planChapter(cp, ctx);
    case "WRITING":
      return writePart(cp, ctx);
    default:
      return { done: true };
  }
}

function options(cp: GenerationCheckpoint): GenerationOptions {
  return (cp.options ?? {}) as GenerationOptions;
}

/** D3c: the worker's PDFs and images frozen on this chapter's checkpoint, read back for the call. */
async function dataAttachments(cp: GenerationCheckpoint) {
  const refs = Array.isArray(cp.attachments) ? (cp.attachments as unknown as AttachmentRef[]) : [];
  return refs.length ? loadDataAttachments(refs) : [];
}

function systemBlocks(cp: GenerationCheckpoint): ClaudeTextBlock[] {
  return [{ type: "text", text: cp.promptText, cache_control: CACHE }];
}

/** Calls Claude and adds the call's tokens and cost (failed attempts too) to the run's totals. */
async function callClaude(cp: GenerationCheckpoint, input: Omit<ClaudeStreamInput, "system" | "tools" | "effort">): Promise<ClaudeStreamResult> {
  try {
    const result = await streamClaude({ ...input, system: systemBlocks(cp), tools: [PLAN_TOOL], effort: options(cp).effort });
    await addTotals(cp.id, result.model, result.usage);
    return result;
  } catch (error) {
    if (error instanceof ClaudeStreamError) await addTotals(cp.id, null, error.info.usage);
    throw error;
  }
}

async function addTotals(id: string, model: string | null, u: ClaudeUsage): Promise<void> {
  const usd = costUsd(model ?? "claude-sonnet-5", u.inputTokens, u.outputTokens, u.webSearchRequests, { writeTokens: u.cacheWriteTokens, readTokens: u.cacheReadTokens });
  await db.generationCheckpoint
    .updateMany({
      where: { id },
      data: {
        inputTokens: { increment: u.inputTokens },
        outputTokens: { increment: u.outputTokens },
        cacheWriteTokens: { increment: u.cacheWriteTokens },
        cacheReadTokens: { increment: u.cacheReadTokens },
        costUsd: { increment: usd },
      },
    })
    .catch((err) => console.error("[generation] could not add usage totals", id, err));
}

async function planChapter(cp: GenerationCheckpoint, ctx: StepContext): Promise<{ done: boolean }> {
  const chapter = cp.chapterNumber;
  yieldIfNoTime(ctx, stepEstimateMs({ kind: "plan" }));
  const result = await callClaude(cp, {
    user: outlineUserBlocks(cp.briefText, chapter, await dataAttachments(cp)),
    toolChoice: { type: "auto" },
    maxTokens: OUTLINE_MAX_TOKENS,
    deadline: ctx.deadline,
    usage: { projectId: cp.projectId, subsystem: GENERATION_SUBSYSTEM, step: "plan", chapterNumber: chapter },
  });
  if (result.stopReason === "refusal") throw new GenerationError("Claude declined to plan this chapter.", true);
  const call = result.toolCalls.find((c) => c.name === PLAN_TOOL_NAME);
  if (!call || call.input === null) throw new GenerationError("Claude did not return a chapter plan.");
  let plan: ChapterPlan;
  try {
    plan = buildPlan(parsePlanInput(call.input, chapter));
  } catch (error) {
    if (error instanceof PlanError) throw new GenerationError(error.message);
    throw error;
  }

  const res = await saveWithRetry(() => db.generationCheckpoint.updateMany({
    where: { id: cp.id, status: "OUTLINING" },
    data: {
      status: "WRITING",
      plan: plan as unknown as Prisma.InputJsonValue,
      partCount: plan.parts.length,
      partCursor: 0,
      partialOutput: null,
      draftText: null,
      progressPercent: computeProgress({ status: "WRITING", previous: cp.progressPercent, targetWords: plan.targetWords, wordsWritten: 0 }),
      lastStepAt: new Date(),
    },
  }));
  return { done: res.count === 0 };
}

function simulateFailureIfAsked(cp: GenerationCheckpoint, partIndex: number): void {
  const sim = options(cp).simulateFailure;
  if (!sim || sim.atPart !== partIndex || process.env.VERCEL_ENV === "production") return;
  throw new GenerationError(`Simulated failure for testing: part ${partIndex + 1} was not written.`, sim.kind === "fatal");
}

async function writePart(cp: GenerationCheckpoint, ctx: StepContext): Promise<{ done: boolean }> {
  const chapter = cp.chapterNumber;
  const plan = cp.plan as unknown as ChapterPlan | null;
  if (!plan?.parts?.length) throw new GenerationError("The chapter has no plan to write from.", true);
  const k = cp.partCursor;
  const part = plan.parts[k];
  if (!part) throw new GenerationError(`Part ${k + 1} is not in the chapter plan.`, true);
  simulateFailureIfAsked(cp, k);
  yieldIfNoTime(ctx, stepEstimateMs({ kind: "part", targetWords: part.targetWords }));
  const headingNumbers = partUnits(plan, part).map((u) => unitHeadingNumber(plan, u));

  const wordsBefore = plan.parts.slice(0, k).reduce((n, p) => n + (p.words ?? 0), 0);
  const user = partUserBlocks({ briefText: cp.briefText, plan, partialOutput: cp.partialOutput, chapter, partIndex: k, attachments: await dataAttachments(cp) });

  // Live progress: the streaming text is saved every few thousand characters, one write at a time.
  let draft = "";
  let savedChars = 0;
  let savedAt = Date.now();
  let progress = cp.progressPercent;
  let saving = null as Promise<unknown> | null;
  const saveDraft = () => {
    const text = draft;
    savedChars = text.length;
    savedAt = Date.now();
    progress = computeProgress({ status: "WRITING", previous: progress, targetWords: plan.targetWords, wordsWritten: wordsBefore + countWords(text) });
    saving = db.generationCheckpoint
      .updateMany({ where: { id: cp.id, status: "WRITING", partCursor: k }, data: { draftText: text, progressPercent: progress, lastStepAt: new Date() } })
      .catch((err) => console.warn("[generation] draft save failed", cp.id, err))
      .finally(() => {
        saving = null;
      });
  };

  let result: ClaudeStreamResult;
  try {
    result = await callClaude(cp, {
      user,
      toolChoice: { type: "none" },
      maxTokens: partMaxTokens(part.targetWords, cp.failedSteps),
      deadline: ctx.deadline,
      onText: (delta) => {
        draft += delta;
        if (!saving && (draft.length - savedChars >= DRAFT_SAVE_CHARS || Date.now() - savedAt >= DRAFT_SAVE_MS)) saveDraft();
      },
      usage: { projectId: cp.projectId, subsystem: GENERATION_SUBSYSTEM, step: `part_${k + 1}`, chapterNumber: chapter },
    });
  } finally {
    if (saving) await saving;
  }

  if (result.stopReason === "refusal") throw new GenerationError(`Claude declined to write part ${k + 1}.`, true);
  if (result.stopReason === "max_tokens") throw new GenerationError(`Part ${k + 1} was cut off at the length limit.`);
  const { body, report } = splitAgentReport(result.text);
  const text = cleanPartText(body, chapter, { first: k === 0 });
  const problem = nonAnswerReason(text, { firstHeading: headingNumbers[0], targetWords: part.targetWords });
  if (problem) {
    // Keep what came back for inspection; it is never appended to the chapter.
    await db.generationCheckpoint.updateMany({ where: { id: cp.id, status: "WRITING", partCursor: k }, data: { draftText: result.text } }).catch(() => {});
    const opening = result.text.replace(/\s+/g, " ").trim().slice(0, 160);
    throw new GenerationError(`Part ${k + 1} was not written: ${problem} (stop reason ${result.stopReason ?? "none"}; reply began "${opening}").`);
  }
  const words = countWords(text);

  const warnings = missingHeadings(text, headingNumbers).map((n) => `Heading ${n} was not found in the text.`);
  const parts = plan.parts.map((p, i) => (i === k ? { ...p, done: true, words, chars: text.length, outputTokens: result.usage.outputTokens, warnings } : p));
  const partialOutput = cp.partialOutput ? cp.partialOutput + PART_SEPARATOR + text : text;
  const last = k + 1 >= plan.parts.length;
  const now = new Date();
  // A paid-for part must not be lost to one failed write (the shared pooler has had timeouts): retry it before giving up.
  const res = await saveWithRetry(() => db.generationCheckpoint.updateMany({
    where: { id: cp.id, status: "WRITING", partCursor: k },
    data: {
      plan: { ...plan, parts, ...(report ? { agentReport: report } : {}) } as unknown as Prisma.InputJsonValue,
      partCursor: k + 1,
      partialOutput,
      draftText: null,
      lastStepAt: now,
      ...(last
        ? { status: "COMPLETED" as const, fullOutput: partialOutput, progressPercent: 100, completedAt: now, errorMessage: null, lastError: null }
        : { progressPercent: computeProgress({ status: "WRITING", previous: progress, targetWords: plan.targetWords, wordsWritten: wordsBefore + words }) }),
    },
  }));
  return { done: res.count === 0 || last };
}

/** Marks a run FAILED. partialOutput (the parts already written) and the failing part's draft are kept. */
export async function failChapterGeneration(checkpointId: string, message: string, failedSteps: number): Promise<boolean> {
  const res = await db.generationCheckpoint.updateMany({
    where: { id: checkpointId, status: { in: ACTIVE_STATUSES } },
    data: { status: "FAILED", errorMessage: message, lastError: message, failedSteps, lockedUntil: null, lastStepAt: new Date() },
  });
  return res.count > 0;
}

// ─── Reading runs ───────────────────────────────────────────────────────────

/** Everything a progress display needs, without the (large) prompt and text columns. */
export const SNAPSHOT_SELECT = {
  id: true,
  projectId: true,
  chapterNumber: true,
  status: true,
  progressPercent: true,
  partCursor: true,
  partCount: true,
  failedSteps: true,
  errorMessage: true,
  lastError: true,
  lockedUntil: true,
  lastStepAt: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  inputTokens: true,
  outputTokens: true,
  cacheWriteTokens: true,
  cacheReadTokens: true,
  costUsd: true,
} satisfies Prisma.GenerationCheckpointSelect;

export type GenerationSnapshot = Prisma.GenerationCheckpointGetPayload<{ select: typeof SNAPSHOT_SELECT }>;

export async function listGenerationSnapshots(projectId: string, chapter?: number): Promise<GenerationSnapshot[]> {
  return db.generationCheckpoint.findMany({
    where: { projectId, ...(chapter ? { chapterNumber: chapter } : {}) },
    orderBy: { chapterNumber: "asc" },
    select: SNAPSHOT_SELECT,
  });
}

/** Status for the API: the snapshot plus totals; with `withOutput`, the plan and the text. Never the prompt. */
export async function getGenerationStatus(projectId: string, opts: { chapter?: number; withOutput?: boolean } = {}) {
  const rows = await db.generationCheckpoint.findMany({
    where: { projectId, ...(opts.chapter ? { chapterNumber: opts.chapter } : {}) },
    orderBy: { chapterNumber: "asc" },
    select: {
      ...SNAPSHOT_SELECT,
      promptMeta: true,
      plan: true,
      ...(opts.withOutput ? { partialOutput: true, draftText: true, fullOutput: true } : {}),
    },
  });
  const rate = usdToNairaRate();
  return rows.map((r) => {
    const plan = r.plan as unknown as ChapterPlan | null;
    return {
      ...r,
      tokensUsed: r.inputTokens + r.cacheWriteTokens + r.cacheReadTokens + r.outputTokens,
      costNaira: Math.round(r.costUsd * rate * 100) / 100,
      plan: plan ? { targetWords: plan.targetWords, sections: plan.sections, parts: plan.parts, agentReport: plan.agentReport ?? null } : null,
    };
  });
}

/** The finished chapter's length, for the completion event (read once per run, not on every poll). */
export async function chapterOutputStats(checkpointId: string): Promise<{ outputLength: number; words: number } | null> {
  const row = await db.generationCheckpoint.findUnique({ where: { id: checkpointId }, select: { fullOutput: true } });
  if (!row?.fullOutput) return null;
  return { outputLength: row.fullOutput.length, words: countWords(row.fullOutput) };
}

/** Project.id from an id or EC code, scoped to a worker's own assignments when a workerId is given. */
export async function resolveGenerationProject(idOrCode: string, workerId?: string): Promise<{ id: string; projectId: string } | null> {
  return db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }], ...(workerId ? { workerId } : {}) },
    select: { id: true, projectId: true },
  });
}
