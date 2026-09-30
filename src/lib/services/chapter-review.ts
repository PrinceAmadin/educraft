/**
 * Chapter review (30 Sept 2026): the AI draft, the COO's correction notes and
 * the report-wide view. Approving is reviewVersion's release (services/deliverables.ts),
 * which applies the chapter-review rules there.
 *
 *   ensureChapterDraft   a finished chapter becomes its AI draft: the chapter as its own Word
 *                        file (stamped), once the chapter gate has checked it (services/chapter-gate.ts:
 *                        passed, or failed with no rewrite left), stored as a SYSTEM version for the
 *                        specialist with the check's result in its note. One draft per text; never once
 *                        a person has uploaded their version.
 *   returnChapter        the COO's correction notes: on the upload waiting for approval, on an
 *                        approved chapter (it stays in use until the correction is approved), or
 *                        on the AI draft before the specialist uploads.
 *   projectReviewState   every chapter's review state, for the screens, the gate and the orchestrator.
 */

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
import { putPrivateFile, deleteStoredFile } from "@/lib/files/storage";
import { findingLines } from "@/lib/quality/chapter-gate";
import { draftSourceHash } from "@/lib/quality/chapter-hash";
import { readBackVersion } from "@/lib/services/chapter-readback";
import { aiTextStep, requestChapterCheck, type ChapterCheckRow } from "@/lib/services/chapter-gate";
import { chapterReviewItems } from "@/lib/services/chapter-texts";
import { DeliverableError, ensureDeliverables, generatedReportPath, reviewVersion } from "@/lib/services/deliverables";
import { notifyOperations, notifyUsers } from "@/lib/services/notifications";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const TAG = "[chapter review]";

/** The AI draft's identity: its build and the text (services/chapter-gate.ts stamps the checked file the same way). */
export const sourceHashOf = draftSourceHash;

/** The draft's note: the chapter check's result, in the specialist's words. */
function draftNote(check: ChapterCheckRow | null, outcome: "passed" | "failed" | "unchecked", rewrites: number): string {
  const t = CHAPTER_REVIEW_TEXT.check;
  const warnings = check?.warnings.length ? [t.warningsIntro, ...findingLines(check.warnings, "check", 12)] : [];
  if (outcome === "passed" && check) return [t.passedNote(check.passedCount ?? 0, check.applicable ?? 0), ...warnings].join("\n");
  if (outcome === "failed" && check) return [t.failedNote(rewrites), ...findingLines(check.failures, "fix"), ...warnings].join("\n");
  return t.uncheckedNote;
}

export type DraftOutcome = "created" | "exists" | "reviewed" | "not-written" | "no-item" | "checking";

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

  // Chapter gate: the draft waits for the chapter's quality check (and any rewrite it leads to).
  const gate = await aiTextStep(projectDbId, chapter);
  if (!gate) return "not-written";
  if (gate.step.kind !== "handover") {
    if (gate.step.kind === "check") await requestChapterCheck(projectDbId, chapter, "AI_TEXT");
    return "checking";
  }
  const outcome = gate.step.outcome;

  let input;
  try {
    input = await loadAssemblyInput(projectDbId, { source: "ai", only: [chapter] });
  } catch (error) {
    if (error instanceof AssemblyError) return "not-written";
    throw error;
  }
  const { buffer } = await packChapter(input, chapter, { sourceHash });
  const note = draftNote(gate.check, outcome, gate.rewritesUsed);

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
      message:
        outcome === "passed"
          ? `${project.projectId}: Chapter ${chapter} passed its quality check. Review it in Word, correct it and upload your version for the COO's approval.`
          : `${project.projectId}: Chapter ${chapter} did not pass its quality check. The points to fix are on the draft; correct them in Word and upload your version for the COO's approval.`,
      type: outcome === "passed" ? "info" : "warning",
      link: `/worker/projects/${project.projectId}?tab=documents`,
    }).catch(() => undefined);
  }
  // A draft handed over without passing is told to the founder and the COO once (this draft is made once).
  if (outcome !== "passed" && project) {
    const t = CHAPTER_REVIEW_TEXT.check;
    await notifyOperations({
      title: t.draftFailedTitle(project.projectId, chapter),
      message: t.draftFailedMessage(project.projectId, chapter, outcome === "failed" ? t.whyFailed(gate.rewritesUsed) : t.whyUnchecked),
      type: "warning",
      link: `/admin/projects/${project.projectId}?tab=documents`,
    }).catch(() => undefined);
  }
  return "created";
}

/**
 * Drafts for every finished chapter that has none (a page load, the orchestrator, the backfill).
 * Cheap when there is nothing to do: it compares timestamps before reading any chapter text.
 */
export async function ensureChapterDrafts(projectDbId: string): Promise<void> {
  const runs = await db.generationCheckpoint.findMany({ where: { projectId: projectDbId, status: "COMPLETED" }, select: { chapterNumber: true, completedAt: true, outputHash: true } });
  if (!runs.length) return;
  const [items, checks] = await Promise.all([
    db.projectDeliverable.findMany({
      where: { projectId: projectDbId, kind: "CHAPTER", archivedAt: null },
      select: { chapter: true, versions: { where: { file: { deletedAt: null } }, select: { submittedByRole: true, createdAt: true } } },
    }),
    db.chapterCheck.findMany({ where: { projectId: projectDbId, subject: "AI_TEXT" }, select: { chapterNumber: true, textHash: true, settledAt: true, status: true, lockedUntil: true } }),
  ]);
  for (const r of runs) {
    const item = items.find((i) => i.chapter === r.chapterNumber);
    if (item?.versions.some((v) => !isAiDraft(v))) continue;
    // Settled: the current text's check is finished and the draft was made after it. Anything else asks again
    // (a chapter written before the chapter gate has no check yet, so its draft is made anew once it is checked).
    const check = r.outputHash ? checks.find((c) => c.chapterNumber === r.chapterNumber && c.textHash === r.outputHash) : null;
    const latestDraft = Math.max(0, ...(item?.versions ?? []).map((v) => v.createdAt.getTime()));
    const settledAt = check?.status === "RUNNING" ? null : check?.settledAt?.getTime() ?? null;
    if (item && settledAt !== null && latestDraft >= Math.max(settledAt, r.completedAt?.getTime() ?? 0)) continue;
    // A check that is running hands the draft over itself when it ends.
    if (check?.status === "RUNNING" && check.lockedUntil && check.lockedUntil > new Date()) continue;
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
