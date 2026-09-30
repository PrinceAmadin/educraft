/**
 * Chapter review (30 Sept 2026): the AI draft, the COO's correction notes and
 * the report-wide view. Approving is reviewVersion's release (services/deliverables.ts),
 * which applies the chapter-review rules there.
 *
 *   ensureChapterDraft   a finished chapter becomes its AI draft: the chapter as its own Word
 *                        file (stamped), checked by the gate's free, no-AI checks, stored as a
 *                        SYSTEM version for the specialist. One draft per text; never once a person
 *                        has uploaded their version.
 *   returnChapter        the COO's correction notes: on the upload waiting for approval, on an
 *                        approved chapter (it stays in use until the correction is approved), or
 *                        on the AI draft before the specialist uploads.
 *   projectReviewState   every chapter's review state, for the screens, the gate and the orchestrator.
 */

import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sqlTable } from "@/lib/db-schema";
import { chapterFileName, loadAssemblyInput, packChapter } from "@/lib/assembly/assemble";
import { AssemblyError } from "@/lib/assembly/errors";
import { expectedChapters } from "@/lib/deliverables";
import {
  CHAPTER_REVIEW_TEXT,
  chapterItems,
  chapterReviewState,
  currentAiDraft,
  isAiDraft,
  latestHumanVersion,
  reportReview,
  reviewApplies,
  type ChapterReviewState,
  type ReportReview,
} from "@/lib/chapter-review";
import { lookupDepartment } from "@/lib/generation/department-map";
import { putPrivateFile, deleteStoredFile } from "@/lib/files/storage";
import { finishReport, prepareReport } from "@/lib/quality/evaluate";
import { knownCommonCitation } from "@/lib/quality/known-citations";
import type { QualityItem } from "@/lib/quality/types";
import { getApprovedBrief } from "@/lib/research/source-stage-actions";
import { readBackVersion } from "@/lib/services/chapter-readback";
import { chapterReviewItems } from "@/lib/services/chapter-texts";
import { DeliverableError, ensureDeliverables, generatedReportPath, reviewVersion } from "@/lib/services/deliverables";
import { notifyUsers } from "@/lib/services/notifications";
import { getApprovedModeSettings } from "@/lib/services/research-mode";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const TAG = "[chapter review]";

export const sourceHashOf = (text: string) => crypto.createHash("sha256").update(text).digest("hex").slice(0, 32);

/** The free checks' findings for one chapter, the specialist's first to-do list (never AI-judged). */
const CHAPTER_CHECKS = new Set(["voice", "reference", "structural"]);
const REPORT_WIDE = new Set(["ST1", "ST2", "ST9", "ST10", "ST12"]);

export function draftFindingLines(failures: QualityItem[], warnings: QualityItem[], chapter: number): string[] {
  const mine = (f: QualityItem) => CHAPTER_CHECKS.has(f.layer) && !REPORT_WIDE.has(f.id) && (f.chapter === chapter || f.locations.some((l) => l.chapter === chapter));
  const line = (f: QualityItem) => {
    const quote = f.locations.find((l) => l.chapter === chapter && l.quote)?.quote;
    return `${f.status === "WARN" ? "Check" : "Fix"}: ${f.message}${quote ? ` ("${quote.slice(0, 120)}")` : ""}${f.fix ? ` ${f.fix}` : ""}`;
  };
  return [...failures.filter(mine).map(line), ...warnings.filter(mine).map(line)].slice(0, 25);
}

/** Runs the gate's free layers on one chapter alone. Returns the lines for the specialist. */
async function freeChecks(projectDbId: string, input: Awaited<ReturnType<typeof loadAssemblyInput>>, chapter: number): Promise<string[]> {
  const [settings, brief, refRows, checkpoints, project] = await Promise.all([
    getApprovedModeSettings(projectDbId).catch(() => null),
    getApprovedBrief(db, projectDbId).catch(() => null),
    db.reference.findMany({
      where: { projectId: projectDbId, status: "KEPT" },
      select: { id: true, title: true, proposedTitle: true, authors: true, year: true, journal: true, abstract: true, classification: true },
    }),
    db.generationCheckpoint.findMany({ where: { projectId: projectDbId, chapterNumber: chapter }, select: { chapterNumber: true, plan: true } }),
    db.project.findUnique({ where: { id: projectDbId }, select: { departmentOutline: true } }),
  ]);
  const references = refRows.map((r) => ({ ...r, classification: r.classification ?? null }));
  const prepared = await prepareReport({ input: { ...input, includePrelims: false }, references, knownCommon: knownCommonCitation, primarySources: brief?.sources });
  const plan = checkpoints[0]?.plan as { targetWords?: number; sections?: { number: string; heading: string }[] } | null;
  const { score } = finishReport(
    prepared,
    { voice: [], voiceNotes: [], support: { results: [], checked: 0, total: 0 }, traceability: null, errors: [] },
    {
      objectives: brief?.objectives ?? [],
      pureScience: Boolean(lookupDepartment(settings?.department ?? input.department)?.pureScience),
      supervisorToc: Boolean(project?.departmentOutline?.trim()),
      plans: new Map([[chapter, plan && typeof plan.targetWords === "number" ? { targetWords: plan.targetWords, sections: plan.sections ?? [] } : null]]),
    },
  );
  return draftFindingLines(score.failures, score.warnings, chapter);
}

export type DraftOutcome = "created" | "exists" | "reviewed" | "not-written" | "no-item";

/**
 * Makes the chapter's AI draft for the specialist, once per generated text. Safe to call
 * again and again: an unchanged text, or a chapter a person has already uploaded, is left alone.
 */
export async function ensureChapterDraft(projectDbId: string, chapter: number): Promise<DraftOutcome> {
  const run = await db.generationCheckpoint.findUnique({
    where: { projectId_chapterNumber: { projectId: projectDbId, chapterNumber: chapter } },
    select: { status: true, fullOutput: true },
  });
  if (run?.status !== "COMPLETED" || !run.fullOutput) return "not-written";
  const sourceHash = sourceHashOf(run.fullOutput);
  await ensureDeliverables(projectDbId);
  const item = await db.projectDeliverable.findFirst({
    where: { projectId: projectDbId, kind: "CHAPTER", chapter, archivedAt: null },
    orderBy: { sortOrder: "asc" },
    select: { id: true, versions: { where: { file: { deletedAt: null } }, select: { submittedByRole: true, sourceHash: true } } },
  });
  if (!item) return "no-item";
  if (item.versions.some((v) => !isAiDraft(v))) return "reviewed";
  if (item.versions.some((v) => v.sourceHash === sourceHash)) return "exists";

  let input;
  try {
    input = await loadAssemblyInput(projectDbId, { source: "ai", only: [chapter] });
  } catch (error) {
    if (error instanceof AssemblyError) return "not-written";
    throw error;
  }
  const { buffer } = await packChapter(input, chapter, { sourceHash });
  const findings = await freeChecks(projectDbId, input, chapter).catch((error) => {
    console.warn(`${TAG} ${input.projectCode} ch${chapter}: the free checks did not run`, error instanceof Error ? error.message : error);
    return [] as string[];
  });
  const note = findings.length
    ? `Automated check (no AI): ${findings.length} point${findings.length === 1 ? "" : "s"} to look at.\n${findings.join("\n")}`
    : "Automated check (no AI): nothing found. Read it through all the same.";

  const pathname = generatedReportPath(projectDbId, item.id);
  const { url } = await putPrivateFile(pathname, buffer, DOCX);
  const fileName = chapterFileName(input.title, input.projectCode, chapter).replace(/\.docx$/, " (AI draft).docx");
  const versionId = await db
    .$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM ${sqlTable("ProjectDeliverable")} WHERE id = ${item.id} FOR UPDATE`;
        // Checked again under the lock: a person's upload or the same draft may have landed meanwhile.
        const now = await tx.deliverableVersion.findMany({ where: { deliverableId: item.id, file: { deletedAt: null } }, select: { submittedByRole: true, sourceHash: true } });
        if (now.some((v) => !isAiDraft(v)) || now.some((v) => v.sourceHash === sourceHash)) return null;
        const last = await tx.deliverableVersion.aggregate({ where: { deliverableId: item.id }, _max: { version: true } });
        const file = await tx.projectFile.create({
          data: {
            projectId: projectDbId,
            fileName,
            fileUrl: url,
            fileSize: buffer.byteLength,
            fileType: DOCX,
            category: "ai_draft",
            uploadedBy: null,
            uploaderRole: "SYSTEM",
            storage: "PRIVATE_BLOB",
            blobPathname: pathname,
            deliverableId: item.id,
          },
          select: { id: true },
        });
        // Only earlier AI drafts give way to a newer one.
        await tx.deliverableVersion.updateMany({ where: { deliverableId: item.id, status: "SUBMITTED", submittedByRole: "SYSTEM" }, data: { status: "SUPERSEDED" } });
        const v = await tx.deliverableVersion.create({
          data: { deliverableId: item.id, version: (last._max.version ?? 0) + 1, fileId: file.id, submittedById: "system", submittedByRole: "SYSTEM", workerNote: note, sourceHash },
          select: { id: true },
        });
        await tx.projectDeliverable.update({ where: { id: item.id }, data: { status: "IN_REVIEW" } });
        return v.id;
      },
      { timeout: 15_000, maxWait: 10_000 },
    )
    .catch(async (error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
      throw error;
    });
  if (!versionId) {
    await deleteStoredFile(pathname).catch(() => undefined);
    return "exists";
  }
  await readBackVersion(versionId).catch((error) => console.warn(`${TAG} ${input.projectCode} ch${chapter}: the draft was not read back`, error instanceof Error ? error.message : error));

  const project = await db.project.findUnique({ where: { id: projectDbId }, select: { projectId: true, worker: { select: { userId: true } } } });
  if (project?.worker?.userId) {
    await notifyUsers([project.worker.userId], {
      title: `Chapter ${chapter} AI draft ready`,
      message: `${project.projectId}: review Chapter ${chapter} in Word, correct it and upload your version for the COO's approval.`,
      type: "info",
      link: `/worker/projects/${project.projectId}?tab=documents`,
    }).catch(() => undefined);
  }
  return "created";
}

/**
 * Drafts for every finished chapter that has none (a page load, the orchestrator, the backfill).
 * Cheap when there is nothing to do: it compares timestamps before reading any chapter text.
 */
export async function ensureChapterDrafts(projectDbId: string): Promise<void> {
  const runs = await db.generationCheckpoint.findMany({ where: { projectId: projectDbId, status: "COMPLETED" }, select: { chapterNumber: true, completedAt: true } });
  if (!runs.length) return;
  const items = await db.projectDeliverable.findMany({
    where: { projectId: projectDbId, kind: "CHAPTER", archivedAt: null },
    select: { chapter: true, versions: { where: { file: { deletedAt: null } }, select: { submittedByRole: true, createdAt: true } } },
  });
  for (const r of runs) {
    const item = items.find((i) => i.chapter === r.chapterNumber);
    if (item?.versions.some((v) => !isAiDraft(v))) continue;
    const latestDraft = Math.max(0, ...(item?.versions ?? []).map((v) => v.createdAt.getTime()));
    if (item && latestDraft >= (r.completedAt?.getTime() ?? 0)) continue;
    await ensureChapterDraft(projectDbId, r.chapterNumber).catch((error) => console.warn(`${TAG} draft for chapter ${r.chapterNumber} not made`, error instanceof Error ? error.message : error));
  }
}

// ─── The report's review state ───────────────────────────────────────────────

export interface ProjectReviewState extends ReportReview {
  applies: boolean;
  expected: number[];
}

export async function projectReviewState(projectDbId: string): Promise<ProjectReviewState> {
  const [project, runs, items] = await Promise.all([
    db.project.findUnique({ where: { id: projectDbId }, select: { chapterCount: true, additionalData: true, service: { select: { serviceCode: true } } } }),
    db.generationCheckpoint.count({ where: { projectId: projectDbId } }),
    chapterReviewItems(projectDbId),
  ]);
  const expected = project ? expectedChapters({ serviceCode: project.service.serviceCode, additionalData: project.additionalData, chapterCount: project.chapterCount }) : [];
  return { ...reportReview(items, expected), applies: reviewApplies({ generationRuns: runs }), expected };
}

// ─── The COO's correction notes ──────────────────────────────────────────────

export type ReturnOutcome = "returned-upload" | "returned-draft" | "changes-requested";

/**
 * Sends a chapter back to the specialist with the COO's notes, whatever stage it is at.
 * An approved chapter stays the one in use until the correction is approved.
 */
export async function returnChapter(input: { projectIdOrCode: string; chapter: number; note: string; actor: { userId: string; name: string } }): Promise<{ outcome: ReturnOutcome }> {
  const note = input.note.trim();
  if (note.length < 3) throw new DeliverableError(CHAPTER_REVIEW_TEXT.returnHint, 400);
  const project = await db.project.findFirst({
    where: { OR: [{ id: input.projectIdOrCode }, { projectId: input.projectIdOrCode }] },
    select: { id: true, projectId: true, worker: { select: { userId: true } } },
  });
  if (!project) throw new DeliverableError("Project not found", 404);
  const items = await chapterReviewItems(project.id);
  const item = chapterItems(items, [input.chapter]).get(input.chapter);
  if (!item) throw new DeliverableError(`This project has no Chapter ${input.chapter} to review.`, 404);
  const state: ChapterReviewState = chapterReviewState(item);

  if (state === "AWAITING_APPROVAL" || state === "UPDATE_WAITING") {
    const upload = latestHumanVersion(item.versions);
    await reviewVersion({ projectIdOrCode: project.id, versionId: upload!.id, decision: "return", note, adminUserId: input.actor.userId });
    return { outcome: "returned-upload" };
  }
  if (state === "DRAFT_READY") {
    const draft = currentAiDraft(item.versions)!;
    await reviewVersion({ projectIdOrCode: project.id, versionId: draft.id, decision: "return", note, adminUserId: input.actor.userId });
    return { outcome: "returned-draft" };
  }
  if (state === "APPROVED" || state === "CHANGES_REQUESTED") {
    await db.projectDeliverable.update({ where: { id: item.id }, data: { changeNote: note, changeNoteAt: new Date(), changeNoteById: input.actor.userId, status: "CHANGES_REQUESTED" } });
    await notifyUsers([project.worker?.userId], {
      title: `Changes requested: Chapter ${input.chapter}`,
      message: `${project.projectId}: ${note}`,
      type: "warning",
      link: `/worker/projects/${project.projectId}?tab=documents`,
    });
    return { outcome: "changes-requested" };
  }
  if (state === "RETURNED") throw new DeliverableError(`Chapter ${input.chapter} is already with the specialist with your notes.`, 409, "ALREADY_RETURNED");
  throw new DeliverableError(`Chapter ${input.chapter} is not written yet.`, 409, "NOT_WRITTEN");
}
