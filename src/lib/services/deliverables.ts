import crypto from "node:crypto";
import { Prisma, type DeliverableAccess, type ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { sqlTable } from "@/lib/db-schema";
import { deliverableTemplate, expectedChapters, orderedChapters } from "@/lib/deliverables";
import { deliverableGate, type Gate } from "@/lib/files/policy";
import { checkUploadedFile, type UploadedFileInput } from "@/lib/files/register";
import { buildPrivatePath } from "@/lib/files/paths";
import { deleteStoredFile, putPrivateFile } from "@/lib/files/storage";
import { releaseAnnouncement } from "@/lib/client-document-text";
import {
  approvalRefusals,
  builtFromIsStale,
  CHAPTER_REVIEW_TEXT,
  chapterReviewState,
  isAiDraft,
  isWordFile,
  reportReview,
  type ChapterReviewState,
} from "@/lib/chapter-review";
import { ensureReadback, readBackVersion, readbackFacts, readStoredReadback, type StoredReadback } from "@/lib/services/chapter-readback";
import { chapterReviewItems } from "@/lib/services/chapter-texts";
import { siteUrl } from "@/lib/site-url";
import { documentReadyMessage, toWaNumber, waLink } from "@/lib/whatsapp";
import { recordUpdate } from "@/lib/services/client-updates";
import { notifyClient, clientProjectPath } from "@/lib/services/client-notify";
import { notifyOperations, notifyUsers } from "@/lib/services/notifications";
import { chapterGateStep, checkView, failureLines, gateFactFrom, rewritePolicy, rewritesAllowed, REWRITES_SETTING, type AiTextView, type CheckView } from "@/lib/quality/chapter-gate";
import type { QualityItem } from "@/lib/quality/types";
import { deliverIfFinalReleased, transitionProject } from "@/lib/services/projects";

/** A stored file becomes the deliverable's next version (older unreviewed ones are superseded); the deliverable goes IN_REVIEW. */
async function recordVersion(input: {
  projectDbId: string;
  deliverableId: string;
  file: { fileName: string; url: string; size: number; contentType: string; pathname: string };
  submittedById: string;
  /** WORKER or ADMIN; SYSTEM for the quality gate's own submission (D8), with the person who ran the gate. */
  submittedByRole: "WORKER" | "ADMIN" | "SYSTEM";
  note: string | null;
  /** A complete document built from approved chapters: the chapter version ids (chapter review). */
  builtFrom?: Record<string, string> | null;
}): Promise<{ versionId: string; fileId: string }> {
  return db
    .$transaction(
      async (tx) => {
        // One at a time per deliverable while the version number is chosen.
        await tx.$queryRaw`SELECT id FROM ${sqlTable("ProjectDeliverable")} WHERE id = ${input.deliverableId} FOR UPDATE`;
        const last = await tx.deliverableVersion.aggregate({ where: { deliverableId: input.deliverableId }, _max: { version: true } });
        const file = await tx.projectFile.create({
          data: {
            projectId: input.projectDbId,
            fileName: input.file.fileName,
            fileUrl: input.file.url,
            fileSize: input.file.size,
            fileType: input.file.contentType,
            category: "from_worker",
            uploadedBy: input.submittedById,
            uploaderRole: input.submittedByRole,
            storage: "PRIVATE_BLOB",
            blobPathname: input.file.pathname,
            deliverableId: input.deliverableId,
          },
          select: { id: true },
        });
        // An upload that was never reviewed is replaced by the newer one.
        await tx.deliverableVersion.updateMany({
          where: { deliverableId: input.deliverableId, status: "SUBMITTED" },
          data: { status: "SUPERSEDED" },
        });
        const version = await tx.deliverableVersion.create({
          data: {
            deliverableId: input.deliverableId,
            version: (last._max.version ?? 0) + 1,
            fileId: file.id,
            submittedById: input.submittedById,
            submittedByRole: input.submittedByRole,
            workerNote: input.note,
            ...(input.builtFrom ? { builtFrom: input.builtFrom } : {}),
          },
          select: { id: true },
        });
        await tx.projectDeliverable.update({ where: { id: input.deliverableId }, data: { status: "IN_REVIEW" } });
        return { versionId: version.id, fileId: file.id };
      },
      { timeout: 15_000, maxWait: 10_000 }
    )
    .catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new DeliverableError("That upload was already submitted.", 409);
      }
      throw error;
    });
}

/**
 * Chapters and documents: the worker uploads a version, an admin releases it
 * to the client or returns it with a note, and the client downloads a
 * released version when its payment rule allows (files/policy.ts).
 *
 * Every write that two people could make at once is claimed first: a version
 * is released or returned by an update that only matches while it is still
 * SUBMITTED, and a deliverable row is locked while its numbers are chosen, so
 * a double click can never release twice or give two uploads one number.
 */

export class DeliverableError extends Error {
  constructor(
    message: string,
    public status = 400,
    /** A machine-readable reason (e.g. APPROVAL_REFUSED, BUILT_FROM_STALE) with its details, for the screen. */
    public code: string | null = null,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

/** A worker's chapter uploads are welcome from acceptance until the project closes. */
const CHAPTER_SUBMIT_STATUSES: ProjectStatus[] = [
  "IN_PROGRESS",
  "AWAITING_CLIENT_INPUT",
  "REVISION_NEEDED",
  "SUBMITTED",
  "IN_QA_REVIEW",
  "APPROVED",
  "BALANCE_VERIFIED",
  "DELIVERED",
  "SUPERVISOR_CORRECTIONS",
];
/** The complete document goes to the quality check from here (and moves the project to SUBMITTED). */
const FINAL_TO_QA_STATUSES: ProjectStatus[] = ["IN_PROGRESS", "REVISION_NEEDED"];
/** A new complete document for supervisor corrections: reviewed and released, no pipeline move. */
const FINAL_CORRECTION_STATUSES: ProjectStatus[] = ["SUPERVISOR_CORRECTIONS"];
/** The complete document can only reach the client after it passed the quality check. */
const QA_PASSED_STATUSES: ProjectStatus[] = ["APPROVED", "BALANCE_VERIFIED", "DELIVERED", "SUPERVISOR_CORRECTIONS", "COMPLETED"];

export function canSubmitDeliverable(kind: string, status: ProjectStatus): boolean {
  if (kind === "FINAL") return FINAL_TO_QA_STATUSES.includes(status) || FINAL_CORRECTION_STATUSES.includes(status);
  return CHAPTER_SUBMIT_STATUSES.includes(status);
}

export function whySubmitClosed(kind: string, status: ProjectStatus): string {
  if (kind === "FINAL" && (status === "SUBMITTED" || status === "IN_QA_REVIEW")) {
    return "The complete document is in the quality check. Wait for the result.";
  }
  if (kind === "FINAL" && status === "AWAITING_CLIENT_INPUT") {
    return "The project is waiting for the client. The complete document can go in once work resumes.";
  }
  if (status === "ASSIGNED") return "Accept the assignment first.";
  return "Uploads are closed for this project right now.";
}

// ── Setup ────────────────────────────────────────────────────

/**
 * Creates the deliverables a project should have (from its service), adding
 * only missing ones: safe to call on every page load. Never removes any;
 * admins archive instead.
 */
export async function ensureDeliverables(projectDbId: string): Promise<void> {
  const project = await db.project.findUnique({
    where: { id: projectDbId },
    select: {
      chapterCount: true,
      additionalData: true,
      service: { select: { serviceCode: true, serviceName: true } },
      deliverables: { select: { key: true } },
    },
  });
  if (!project) return;
  const have = new Set(project.deliverables.map((d) => d.key));
  const specs = deliverableTemplate({
    serviceCode: project.service.serviceCode,
    serviceName: project.service.serviceName,
    chapterCount: project.chapterCount,
    chapters: orderedChapters(project.additionalData),
  }).filter((s) => !have.has(s.key));
  if (specs.length === 0) return;
  await db.projectDeliverable.createMany({
    data: specs.map((s) => ({
      projectId: projectDbId,
      key: s.key,
      kind: s.kind,
      chapter: s.chapter,
      title: s.title,
      sortOrder: s.sortOrder,
      access: s.access,
      clientHidden: s.clientHidden ?? false,
    })),
    skipDuplicates: true,
  });
}

/** Chapter review applies to a report the pipeline writes (it has generation runs); a hand-written project keeps the plain release flow. */
export async function chapterReviewApplies(projectDbId: string): Promise<boolean> {
  return (await db.generationCheckpoint.count({ where: { projectId: projectDbId } })) > 0;
}

/** Every chapter's approved version now (what a complete document must have been built from). */
async function currentApprovals(projectDbId: string): Promise<Map<number, string>> {
  const project = await db.project.findUnique({ where: { id: projectDbId }, select: { chapterCount: true, additionalData: true, service: { select: { serviceCode: true } } } });
  if (!project) return new Map();
  const expected = expectedChapters({ serviceCode: project.service.serviceCode, additionalData: project.additionalData, chapterCount: project.chapterCount });
  return reportReview(await chapterReviewItems(projectDbId), expected).approvedVersionIds;
}

// ── Reading ──────────────────────────────────────────────────

const versionSelect = {
  id: true,
  version: true,
  releaseNo: true,
  status: true,
  submittedByRole: true,
  workerNote: true,
  reviewNote: true,
  createdAt: true,
  releasedAt: true,
  readback: true,
  builtFrom: true,
  file: { select: { id: true, fileName: true, fileSize: true, hiddenFromWorkerAt: true } },
  formattedFile: { select: { id: true, fileName: true, deletedAt: true } },
} satisfies Prisma.DeliverableVersionSelect;

export interface VersionView {
  id: string;
  version: number;
  releaseNo: number | null;
  status: "SUBMITTED" | "RELEASED" | "RETURNED" | "SUPERSEDED";
  submittedByRole: string;
  /** Chapter review: the AI draft (the specialist works from it; it is never approved). */
  aiDraft: boolean;
  workerNote: string | null;
  reviewNote: string | null;
  createdAt: string;
  releasedAt: string | null;
  fileId: string;
  fileName: string;
  fileSize: number | null;
  /** Chapter review: the upload read back (what the complete report will contain). */
  readback: StoredReadback | null;
  /** A complete document built from approved chapters: which chapters are no longer the approved ones. */
  staleChapters: number[];
  builtFromApproved: boolean;
  /** Chapter gate: the checked Word file of a reviewed upload (what is downloaded once it is approved). */
  formattedFile: { id: string; fileName: string } | null;
  /** Chapter gate: the quality check of this upload's text (null = not checked yet, or not a reviewed chapter). */
  check: CheckView | null;
}

export interface DeliverableView {
  id: string;
  key: string;
  kind: "CHAPTER" | "FINAL" | "OTHER";
  chapter: number | null;
  title: string;
  status: "NOT_STARTED" | "IN_REVIEW" | "CHANGES_REQUESTED" | "RELEASED";
  access: DeliverableAccess;
  archived: boolean;
  clientHidden: boolean;
  /** Newest first. */
  versions: VersionView[];
  /** What the client sees for this item right now. */
  gate: Gate;
  /** Chapter review (a report the pipeline writes): where this chapter stands, and the COO's notes on an approved one. */
  review: { state: ChapterReviewState; changeNote: string | null; changeNoteAt: string | null } | null;
  /** Chapter gate: where the chapter's AI text stands (checked before its draft goes to the specialist). */
  aiText: AiTextView | null;
}

function toVersionView(v: Prisma.DeliverableVersionGetPayload<{ select: typeof versionSelect }>, approvals: Map<number, string> | null, checks?: Map<string, CheckView>): VersionView {
  const staleChapters = v.builtFrom && approvals ? builtFromIsStale(v.builtFrom, approvals) : [];
  return {
    id: v.id,
    version: v.version,
    releaseNo: v.releaseNo,
    status: v.status,
    submittedByRole: v.submittedByRole,
    aiDraft: isAiDraft(v),
    workerNote: v.workerNote,
    reviewNote: v.reviewNote,
    createdAt: v.createdAt.toISOString(),
    releasedAt: v.releasedAt ? v.releasedAt.toISOString() : null,
    fileId: v.file.id,
    fileName: v.file.fileName,
    fileSize: v.file.fileSize,
    readback: readStoredReadback(v.readback),
    staleChapters,
    builtFromApproved: v.builtFrom != null,
    formattedFile: v.formattedFile && !v.formattedFile.deletedAt ? { id: v.formattedFile.id, fileName: v.formattedFile.fileName } : null,
    check: checks?.get(v.id) ?? null,
  };
}

/**
 * Chapter gate: each reviewed upload's latest check, and where each chapter's AI text stands
 * (the same rule as the orchestrator and the draft: services/chapter-gate.ts).
 */
async function chapterGateViews(projectDbId: string, rows: LoadedDeliverable[], withCost: boolean): Promise<{ uploads: Map<string, CheckView>; aiText: Map<number, AiTextView> }> {
  const uploadIds = rows.filter((d) => d.kind === "CHAPTER").flatMap((d) => d.versions.filter((v) => !isAiDraft(v)).map((v) => v.id));
  const [uploadRows, checkpoints, aiRows, project, setting] = await Promise.all([
    uploadIds.length
      ? db.chapterCheck.findMany({ where: { projectId: projectDbId, subject: "UPLOAD", versionId: { in: uploadIds } }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
    db.generationCheckpoint.findMany({ where: { projectId: projectDbId }, select: { chapterNumber: true, status: true, outputHash: true, gateRewriteNo: true } }),
    db.chapterCheck.findMany({ where: { projectId: projectDbId, subject: "AI_TEXT" } }),
    db.project.findUnique({
      where: { id: projectDbId },
      select: {
        status: true,
        orchestratorRun: { select: { status: true } },
        researchMode: { select: { modeNumber: true, isLocked: true } },
        pauses: { select: { afterChapter: true, status: true } },
        _count: { select: { files: { where: { category: "secondary_data", deletedAt: null } } } },
      },
    }),
    db.setting.findUnique({ where: { key: REWRITES_SETTING }, select: { value: true } }).catch(() => null),
  ]);
  const uploads = new Map<string, CheckView>();
  for (const r of uploadRows) if (r.versionId && !uploads.has(r.versionId)) uploads.set(r.versionId, checkView(r, withCost));

  const aiText = new Map<number, AiTextView>();
  if (!project) return { uploads, aiText };
  const now = new Date();
  const policy = rewritePolicy(project.orchestratorRun, project.status);
  const maxRewrites = rewritesAllowed(setting?.value);
  for (const cp of checkpoints) {
    if (cp.status === "PENDING" || cp.status === "OUTLINING" || cp.status === "WRITING") {
      if (cp.gateRewriteNo > 0) aiText.set(cp.chapterNumber, { stage: "rewriting", rewritesUsed: cp.gateRewriteNo, check: null });
      continue;
    }
    if (cp.status !== "COMPLETED") continue;
    const row = cp.outputHash ? (aiRows.find((k) => k.chapterNumber === cp.chapterNumber && k.textHash === cp.outputHash) ?? null) : null;
    const fact = gateFactFrom({
      chapter: cp.chapterNumber,
      outputHash: cp.outputHash,
      gateRewriteNo: cp.gateRewriteNo,
      check: row,
      mode: project.researchMode?.isLocked ? project.researchMode.modeNumber : null,
      pauses: project.pauses,
      hasDataset: project._count.files > 0,
    });
    const step = chapterGateStep(fact, { now, maxRewrites, policy });
    aiText.set(cp.chapterNumber, {
      stage: step.kind === "handover" ? "settled" : step.kind === "rewrite" ? "rewriting" : "checking",
      rewritesUsed: cp.gateRewriteNo,
      check: row && row.status !== "RUNNING" ? checkView(row, withCost) : null,
    });
  }
  return { uploads, aiText };
}

type LoadedDeliverable = Awaited<ReturnType<typeof loadDeliverables>>[number];

function reviewOf(d: LoadedDeliverable, applies: boolean): DeliverableView["review"] {
  if (!applies || d.kind !== "CHAPTER") return null;
  const state = chapterReviewState({
    kind: d.kind,
    chapter: d.chapter,
    archived: d.archivedAt != null,
    changeNote: d.changeNote,
    versions: d.versions.map((v) => ({ ...v, fileName: v.file.fileName })),
  });
  return { state, changeNote: d.changeNote, changeNoteAt: d.changeNoteAt ? d.changeNoteAt.toISOString() : null };
}

async function loadDeliverables(projectDbId: string, opts: { forWorker: boolean }) {
  await ensureDeliverables(projectDbId);
  return db.projectDeliverable.findMany({
    where: { projectId: projectDbId, ...(opts.forWorker ? { archivedAt: null } : {}) },
    orderBy: { sortOrder: "asc" },
    include: {
      versions: {
        where: opts.forWorker ? { file: { hiddenFromWorkerAt: null, deletedAt: null } } : { file: { deletedAt: null } },
        orderBy: { version: "desc" },
        select: versionSelect,
      },
    },
  });
}

export async function listDeliverablesForAdmin(projectDbId: string): Promise<DeliverableView[]> {
  const [project, rows, applies] = await Promise.all([
    db.project.findUnique({
      where: { id: projectDbId },
      select: { status: true, downpaymentStatus: true, balanceStatus: true },
    }),
    loadDeliverables(projectDbId, { forWorker: false }),
    chapterReviewApplies(projectDbId),
  ]);
  if (!project) return [];
  const approvals = applies && rows.some((d) => d.versions.some((v) => v.builtFrom != null)) ? await currentApprovals(projectDbId) : null;
  const gate = applies ? await chapterGateViews(projectDbId, rows, true) : null;
  return rows.map((d) => ({
    id: d.id,
    key: d.key,
    kind: d.kind,
    chapter: d.chapter,
    title: d.title,
    status: d.status,
    access: d.access,
    archived: d.archivedAt != null,
    clientHidden: d.clientHidden,
    versions: d.versions.map((v) => toVersionView(v, approvals, gate?.uploads)),
    gate: d.clientHidden
      ? { state: "hidden" }
      : deliverableGate(
          d.archivedAt == null && d.versions.some((v) => v.releaseNo != null),
          d.access,
          project
        ),
    review: reviewOf(d, applies),
    aiText: d.kind === "CHAPTER" && d.chapter != null ? (gate?.aiText.get(d.chapter) ?? null) : null,
  }));
}

/** The worker's view: their uploads, admin copies they may see, return notes. No access or payment state. */
export async function listDeliverablesForWorker(projectDbId: string): Promise<Omit<DeliverableView, "gate" | "access">[]> {
  const [rows, applies] = await Promise.all([loadDeliverables(projectDbId, { forWorker: true }), chapterReviewApplies(projectDbId)]);
  // The specialist never sees what a check cost.
  const gate = applies ? await chapterGateViews(projectDbId, rows, false) : null;
  return rows.map((d) => ({
    id: d.id,
    key: d.key,
    kind: d.kind,
    chapter: d.chapter,
    title: d.title,
    status: d.status,
    archived: false,
    clientHidden: d.clientHidden,
    versions: d.versions.map((v) => toVersionView(v, null, gate?.uploads)),
    review: reviewOf(d, applies),
    aiText: d.kind === "CHAPTER" && d.chapter != null ? (gate?.aiText.get(d.chapter) ?? null) : null,
  }));
}

// ── Worker: submit a version ─────────────────────────────────

export async function submitVersion(input: {
  workerId: string;
  userId: string;
  projectIdOrCode: string;
  deliverableId: string;
  upload: UploadedFileInput;
  note?: string | null;
}): Promise<{ versionId: string; movedToQa: boolean }> {
  const project = await db.project.findFirst({
    where: { workerId: input.workerId, OR: [{ id: input.projectIdOrCode }, { projectId: input.projectIdOrCode }] },
    select: { id: true, projectId: true, status: true },
  });
  if (!project) throw new DeliverableError("Assignment not found", 404);

  const deliverable = await db.projectDeliverable.findFirst({
    where: { id: input.deliverableId, projectId: project.id, archivedAt: null },
    select: { id: true, kind: true, title: true, chapter: true },
  });
  if (!deliverable) throw new DeliverableError("That document isn't part of this project", 404);
  const underReview = await chapterReviewApplies(project.id);
  // Chapter review: the complete project is built from the approved chapters, never uploaded by hand.
  if (underReview && deliverable.kind === "FINAL") throw new DeliverableError(CHAPTER_REVIEW_TEXT.finalByHandRefused, 409, "FINAL_BUILT_FROM_CHAPTERS");
  if (!canSubmitDeliverable(deliverable.kind, project.status)) {
    throw new DeliverableError(whySubmitClosed(deliverable.kind, project.status), 409);
  }

  const checked = await checkUploadedFile(input.upload, {
    userId: input.userId,
    projectDbId: project.id,
    purpose: "deliverable",
    targetId: deliverable.id,
  });
  // A reviewed chapter is read back into the report, so it must be a Word file.
  if (underReview && deliverable.kind === "CHAPTER" && !isWordFile(checked.fileName)) {
    await deleteStoredFile(checked.pathname).catch(() => undefined);
    throw new DeliverableError(CHAPTER_REVIEW_TEXT.refuse.notWord, 400, "NOT_WORD");
  }
  const note = input.note?.trim() || null;

  const { versionId } = await recordVersion({
    projectDbId: project.id,
    deliverableId: deliverable.id,
    file: { fileName: checked.fileName, url: checked.url, size: checked.size, contentType: checked.contentType, pathname: checked.pathname },
    submittedById: input.userId,
    submittedByRole: "WORKER",
    note,
  });

  if (underReview && deliverable.kind === "CHAPTER") {
    // Read it back now, so the COO sees what the report will contain (and anything that would stop approval).
    const read = await readBackVersion(versionId).catch((error) => {
      console.warn(`[chapter review] ${project.projectId}: the upload was not read back yet`, error instanceof Error ? error.message : error);
      return null;
    });
    const blocking = read?.readback.blocking.length ?? 0;
    if (blocking) {
      // A file the reader cannot carry is not checked: the specialist and the COO see why on the card.
      await notifyOperations({
        title: `${deliverable.title} uploaded`,
        message: `${project.projectId}: the specialist uploaded their reviewed ${deliverable.title}. ${blocking} problem${blocking === 1 ? "" : "s"} must be fixed before it can be approved.`,
        type: "info",
        link: `/admin/projects/${project.projectId}?tab=documents`,
      });
    } else if (deliverable.chapter) {
      // Chapter gate: the upload is checked before the COO may approve it; the check tells the COO (or the
      // specialist) how it went.
      await import("@/lib/services/chapter-gate").then((m) => m.requestChapterCheck(project.id, deliverable.chapter as number, "UPLOAD", { versionId }));
    }
    return { versionId, movedToQa: false };
  }

  // The complete document is the one the quality check reviews.
  let movedToQa = false;
  if (deliverable.kind === "FINAL" && FINAL_TO_QA_STATUSES.includes(project.status)) {
    await transitionProject(project.id, "SUBMITTED", { changedById: input.userId, note: note ?? undefined });
    movedToQa = true;
  } else {
    await notifyOperations({
      title: `${deliverable.title} ready for review`,
      message: `${project.projectId}: the specialist uploaded ${deliverable.title}. Review and release it to the client.`,
      type: "info",
      link: `/admin/projects/${project.projectId}?tab=documents`,
    });
  }
  return { versionId, movedToQa };
}

/**
 * Chapter gate: the check of an upload's current text, as approval reads it (null = not checked yet).
 * The text is the read-back's, so a file read again with a newer reader is checked again.
 */
async function uploadCheck(projectDbId: string, chapter: number | null, versionId: string): Promise<{ status: "RUNNING" | "PASSED" | "FAILED" | "ERROR"; lines: string[] } | null> {
  if (!chapter) return null;
  const row = await db.chapterCheck.findFirst({
    where: { projectId: projectDbId, chapterNumber: chapter, subject: "UPLOAD", versionId },
    orderBy: { createdAt: "desc" },
    select: { status: true, failures: true, textHash: true },
  });
  if (!row) return null;
  const { chapterGateCurrentUploadHash } = await import("@/lib/services/chapter-gate");
  const current = await chapterGateCurrentUploadHash(projectDbId, chapter, versionId);
  if (current && current !== row.textHash) return null;
  const failures = Array.isArray(row.failures) ? (row.failures as unknown as QualityItem[]) : [];
  return { status: row.status, lines: failureLines(failures, 8) };
}

/** Where the gate stores the assembled report: a deliverable path with a 12-byte random name, like an upload's. */
export function generatedReportPath(projectDbId: string, deliverableId: string): string {
  return buildPrivatePath({ projectDbId, purpose: "deliverable", targetId: deliverableId, random: crypto.randomBytes(12).toString("hex"), ext: "docx" });
}

/**
 * D8: the quality gate passed, so the assembled report goes to QA on its own as
 * the complete document's next version (stored in the private Blob store, like
 * any upload) and the project moves to SUBMITTED. The QA reviewer downloads
 * exactly the file that was checked.
 */
export async function submitGeneratedReport(input: {
  projectDbId: string;
  buffer: Uint8Array;
  fileName: string;
  note: string;
  /** Whoever ran the gate (recorded on the version); the move itself is the system's. */
  actorUserId: string;
  /** Chapter review: the approved chapter versions the document was built from. */
  builtFrom?: Record<string, string> | null;
  /**
   * False: a rebuild after QA (supervisor corrections, say) is recorded as the next complete
   * document for release, and the pipeline stays where it is.
   */
  moveToQa?: boolean;
}): Promise<{ versionId: string; fileId: string }> {
  const project = await db.project.findUnique({ where: { id: input.projectDbId }, select: { id: true, projectId: true, status: true } });
  if (!project) throw new DeliverableError("Project not found", 404);
  const moveToQa = input.moveToQa !== false;
  if (moveToQa ? !FINAL_TO_QA_STATUSES.includes(project.status) : !QA_PASSED_STATUSES.includes(project.status)) {
    throw new DeliverableError(whySubmitClosed("FINAL", project.status), 409);
  }
  // Deliverables are made when a page first lists them; the gate may be the first to need the complete document.
  await ensureDeliverables(project.id);
  const deliverable = await db.projectDeliverable.findFirst({
    where: { projectId: project.id, kind: "FINAL", archivedAt: null },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  if (!deliverable) throw new DeliverableError("This project has no complete-document deliverable to submit.", 409);

  const pathname = generatedReportPath(project.id, deliverable.id);
  const contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const { url } = await putPrivateFile(pathname, input.buffer, contentType);
  const recorded = await recordVersion({
    projectDbId: project.id,
    deliverableId: deliverable.id,
    file: { fileName: input.fileName, url, size: input.buffer.byteLength, contentType, pathname },
    submittedById: input.actorUserId,
    submittedByRole: "SYSTEM",
    note: input.note,
    builtFrom: input.builtFrom ?? null,
  });
  if (moveToQa) await transitionProject(project.id, "SUBMITTED", { changedById: null, note: input.note });
  return recorded;
}

// ── Admin: review ────────────────────────────────────────────

export interface ReviewResult {
  released: boolean;
  /** A WhatsApp chat with the client, message typed, for the admin to send. */
  whatsappUrl: string | null;
}

async function releaseMessage(projectDbId: string, title: string, isFinal: boolean) {
  const p = await db.project.findUnique({
    where: { id: projectDbId },
    select: { projectId: true, client: { select: { fullName: true, phone: true, clientId: true } } },
  });
  if (!p) return null;
  const wa = toWaNumber(p.client.phone);
  if (!wa) return null;
  return waLink(
    wa,
    documentReadyMessage({
      fullName: p.client.fullName,
      title,
      isFinal,
      projectCode: p.projectId,
      clientId: p.client.clientId,
      documentsUrl: `${siteUrl()}${clientProjectPath(p.projectId, "documents")}`,
    })
  );
}

/**
 * Release a submitted version to the client, or return it to the worker with
 * a note. Returns 409 when someone else already reviewed it.
 */
export async function reviewVersion(input: {
  projectIdOrCode: string;
  versionId: string;
  /** "approve" is a reviewed chapter's release: the same action. */
  decision: "release" | "return" | "approve";
  note?: string | null;
  adminUserId: string;
  /** The read-back the COO looked at (chapter review): approval is refused if the file was read again since. */
  readbackHash?: string | null;
  /** Chapter gate: the founder approves a chapter whose check failed, with this written reason. */
  overrideReason?: string | null;
  /** The reviewer is the super admin (the only one who may give an override). */
  isSuperAdmin?: boolean;
}): Promise<ReviewResult> {
  const version = await db.deliverableVersion.findFirst({
    where: {
      id: input.versionId,
      deliverable: { project: { OR: [{ id: input.projectIdOrCode }, { projectId: input.projectIdOrCode }] } },
    },
    select: {
      id: true,
      status: true,
      submittedByRole: true,
      builtFrom: true,
      file: { select: { fileName: true } },
      deliverable: {
        select: {
          id: true,
          kind: true,
          chapter: true,
          title: true,
          access: true,
          archivedAt: true,
          clientHidden: true,
          project: {
            select: {
              id: true,
              projectId: true,
              status: true,
              downpaymentStatus: true,
              balanceStatus: true,
              worker: { select: { userId: true } },
            },
          },
        },
      },
    },
  });
  if (!version) throw new DeliverableError("Version not found", 404);
  const { deliverable } = version;
  const project = deliverable.project;
  if (version.status !== "SUBMITTED") throw new DeliverableError("Someone already reviewed this upload. Refresh.", 409);

  const note = input.note?.trim() || null;
  const now = new Date();

  if (input.decision === "return") {
    if (!note) throw new DeliverableError("Say what needs to change: the specialist reads this note.");
    const claimed = await db.$transaction(async (tx) => {
      const c = await tx.deliverableVersion.updateMany({
        where: { id: version.id, status: "SUBMITTED" },
        data: { status: "RETURNED", reviewNote: note, reviewedById: input.adminUserId, reviewedAt: now },
      });
      if (c.count === 1) {
        await tx.projectDeliverable.update({ where: { id: deliverable.id }, data: { status: "CHANGES_REQUESTED" } });
      }
      return c.count === 1;
    });
    if (!claimed) throw new DeliverableError("Someone already reviewed this upload. Refresh.", 409);
    await notifyUsers([project.worker?.userId], {
      title: `Changes requested: ${deliverable.title}`,
      message: `${project.projectId}: ${note}`,
      type: "warning",
      link: `/worker/projects/${project.projectId}?tab=documents`,
    });
    return { released: false, whatsappUrl: null };
  }

  if (deliverable.archivedAt) throw new DeliverableError("Restore this document before releasing it.");
  if (deliverable.kind === "FINAL" && !QA_PASSED_STATUSES.includes(project.status)) {
    throw new DeliverableError("The complete document can be released once it has passed the quality check.", 409);
  }

  // Chapter review: releasing a chapter of a generated report is the COO's approval of the specialist's
  // reviewed upload, and only that upload, read back cleanly, can be approved.
  const underReview = await chapterReviewApplies(project.id);
  const approving = underReview && deliverable.kind === "CHAPTER";
  if (approving) {
    const readback = isAiDraft(version) ? null : (await ensureReadback(version.id)).readback;
    const override = input.overrideReason?.trim() || null;
    if (override && !input.isSuperAdmin) throw new DeliverableError(CHAPTER_REVIEW_TEXT.check.refuse.overrideFounderOnly, 403, "OVERRIDE_FOUNDER_ONLY");
    const check = isAiDraft(version) ? null : await uploadCheck(project.id, deliverable.chapter, version.id);
    const refusals = approvalRefusals({
      version: { status: version.status, submittedByRole: version.submittedByRole, fileName: version.file.fileName },
      projectStatus: project.status,
      readback: readbackFacts(readback),
      seenHash: input.readbackHash ?? null,
      check,
      override: Boolean(override),
    });
    if (refusals.length) throw new DeliverableError(refusals[0], 409, "APPROVAL_REFUSED", { refusals });
    if (override && check?.status === "FAILED") {
      // Kept with the chapter and on the project's timeline: the chapter reached the report without passing its check.
      await db.projectNote.create({
        data: { projectId: project.id, kind: "QA", content: `${deliverable.title} approved without passing its quality check. Reason: ${override}`, authorType: "EXEC", authorId: input.adminUserId, authorName: "Founder" },
      }).catch((error) => console.warn("[chapter gate] the override was not noted", error instanceof Error ? error.message : error));
    }
  }
  // A complete document built from approved chapters is out of date once a chapter is approved again.
  if (deliverable.kind === "FINAL" && version.builtFrom) {
    const stale = builtFromIsStale(version.builtFrom, await currentApprovals(project.id));
    if (stale.length) throw new DeliverableError(CHAPTER_REVIEW_TEXT.finalStale(stale), 409, "BUILT_FROM_STALE", { staleChapters: stale });
  }

  const isFinal = deliverable.kind === "FINAL";
  const releaseNo = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM ${sqlTable("ProjectDeliverable")} WHERE id = ${deliverable.id} FOR UPDATE`;
      const last = await tx.deliverableVersion.aggregate({ where: { deliverableId: deliverable.id }, _max: { releaseNo: true } });
      const next = (last._max.releaseNo ?? 0) + 1;
      const c = await tx.deliverableVersion.updateMany({
        where: { id: version.id, status: "SUBMITTED" },
        data: {
          status: "RELEASED",
          releaseNo: next,
          releasedAt: now,
          reviewNote: note,
          reviewedById: input.adminUserId,
          reviewedAt: now,
        },
      });
      if (c.count !== 1) return null;
      // An approval also settles the COO's notes on the chapter it replaces.
      await tx.projectDeliverable.update({
        where: { id: deliverable.id },
        data: { status: "RELEASED", ...(approving ? { changeNote: null, changeNoteAt: null, changeNoteById: null } : {}) },
      });
      const told = announcementFor(next);
      if (told) await recordUpdate(tx, { projectId: project.id, kind: "RELEASE", title: told.feedTitle, body: told.feedBody, dedupeKey: `release:${version.id}` });
      return next;
    },
    { timeout: 15_000, maxWait: 10_000 }
  );
  if (releaseNo == null) throw new DeliverableError("Someone already reviewed this upload. Refresh.", 409);

  // The client hears about a document only when there is something for them (never a chapter that only
  // comes inside the complete project, nor one kept off their list).
  const told = announcementFor(releaseNo);
  if (told) {
    await notifyClient(project.id, {
      title: told.notifyTitle,
      message: told.notifyMessage(project.projectId),
      type: "success",
      tab: told.tab,
      email: { kind: "release", heading: told.notifyTitle, lines: told.emailLines, ctaLabel: told.ctaLabel },
    });
  }
  await notifyUsers([project.worker?.userId], {
    title: approving ? `${deliverable.title} approved` : `${deliverable.title} released`,
    message: approving
      ? `${project.projectId}: the COO approved your ${deliverable.title}. The complete report is built from it.`
      : `${project.projectId}: ${deliverable.title} was released to the client.`,
    type: "success",
    link: `/worker/projects/${project.projectId}?tab=documents`,
  });

  // An approval may be what the orchestrator waits for before the quality check.
  if (approving) await import("@/lib/generation/orchestrator").then((m) => m.nudge(project.id)).catch(() => undefined);

  // Everything paid and the complete document released: that is delivery.
  if (isFinal) await deliverIfFinalReleased(project.id);

  return { released: true, whatsappUrl: told ? await releaseMessage(project.id, deliverable.title, isFinal) : null };

  function announcementFor(releaseNumber: number) {
    if (deliverable.clientHidden) return null;
    return releaseAnnouncement({ title: deliverable.title, isFinal, releaseNo: releaseNumber, gate: deliverableGate(true, deliverable.access, project) });
  }
}

/**
 * An admin's own copy (a reviewed or corrected file). Released at once when
 * `release` is set, else it waits in review like a worker's upload.
 */
export async function adminUploadVersion(input: {
  projectIdOrCode: string;
  deliverableId: string;
  upload: UploadedFileInput;
  note?: string | null;
  release: boolean;
  adminUserId: string;
}): Promise<ReviewResult> {
  const deliverable = await db.projectDeliverable.findFirst({
    where: {
      id: input.deliverableId,
      project: { OR: [{ id: input.projectIdOrCode }, { projectId: input.projectIdOrCode }] },
    },
    select: { id: true, projectId: true, kind: true },
  });
  if (!deliverable) throw new DeliverableError("Document not found", 404);
  const underReview = await chapterReviewApplies(deliverable.projectId);
  if (underReview && deliverable.kind === "FINAL") throw new DeliverableError(CHAPTER_REVIEW_TEXT.finalByHandRefused, 409, "FINAL_BUILT_FROM_CHAPTERS");

  const checked = await checkUploadedFile(input.upload, {
    userId: input.adminUserId,
    projectDbId: deliverable.projectId,
    purpose: "deliverable",
    targetId: deliverable.id,
  });
  if (underReview && deliverable.kind === "CHAPTER" && !isWordFile(checked.fileName)) {
    await deleteStoredFile(checked.pathname).catch(() => undefined);
    throw new DeliverableError(CHAPTER_REVIEW_TEXT.refuse.notWord, 400, "NOT_WORD");
  }

  const versionId = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM ${sqlTable("ProjectDeliverable")} WHERE id = ${deliverable.id} FOR UPDATE`;
      const last = await tx.deliverableVersion.aggregate({ where: { deliverableId: deliverable.id }, _max: { version: true } });
      const file = await tx.projectFile.create({
        data: {
          projectId: deliverable.projectId,
          fileName: checked.fileName,
          fileUrl: checked.url,
          fileSize: checked.size,
          fileType: checked.contentType,
          category: "qa_reviewed",
          uploadedBy: input.adminUserId,
          uploaderRole: "ADMIN",
          storage: "PRIVATE_BLOB",
          blobPathname: checked.pathname,
          deliverableId: deliverable.id,
        },
        select: { id: true },
      });
      await tx.deliverableVersion.updateMany({
        where: { deliverableId: deliverable.id, status: "SUBMITTED" },
        data: { status: "SUPERSEDED" },
      });
      const version = await tx.deliverableVersion.create({
        data: {
          deliverableId: deliverable.id,
          version: (last._max.version ?? 0) + 1,
          fileId: file.id,
          submittedById: input.adminUserId,
          submittedByRole: "ADMIN",
          workerNote: input.note?.trim() || null,
        },
        select: { id: true },
      });
      await tx.projectDeliverable.update({ where: { id: deliverable.id }, data: { status: "IN_REVIEW" } });
      return version.id;
    },
    { timeout: 15_000, maxWait: 10_000 }
  );
  // A reviewed chapter is read back, and checked (chapter gate), before anyone can approve it.
  if (underReview && deliverable.kind === "CHAPTER") {
    const read = await readBackVersion(versionId);
    const chapter = (await db.projectDeliverable.findUnique({ where: { id: deliverable.id }, select: { chapter: true } }))?.chapter ?? null;
    if (chapter && read.readback.blocking.length === 0) {
      const gate = await import("@/lib/services/chapter-gate");
      // "Approve it now" waits for the check (about a minute); otherwise it runs on its own.
      if (input.release) await gate.runChapterCheck(deliverable.projectId, chapter, "UPLOAD", { versionId });
      else await gate.requestChapterCheck(deliverable.projectId, chapter, "UPLOAD", { versionId });
    }
  }

  if (!input.release) return { released: false, whatsappUrl: null };
  return reviewVersion({
    projectIdOrCode: deliverable.projectId,
    versionId,
    decision: "release",
    adminUserId: input.adminUserId,
  });
}

// ── Admin: manage the list ───────────────────────────────────

export async function updateDeliverable(input: {
  projectIdOrCode: string;
  deliverableId: string;
  title?: string;
  access?: DeliverableAccess;
  archived?: boolean;
  actor: { userId: string; role: string };
}): Promise<void> {
  const d = await db.projectDeliverable.findFirst({
    where: {
      id: input.deliverableId,
      project: { OR: [{ id: input.projectIdOrCode }, { projectId: input.projectIdOrCode }] },
    },
    select: { id: true, access: true },
  });
  if (!d) throw new DeliverableError("Document not found", 404);
  // Opening a document before it is paid for is a pricing decision.
  if (input.access === "ALWAYS" && input.actor.role !== "SUPER_ADMIN") {
    throw new DeliverableError("Only a super admin can release a document before it is paid for.", 403);
  }
  // Chapter 3 onwards of a full report reach the client only in the complete project: the founder's rule to lift.
  if (d.access === "WITH_COMPLETE" && input.access !== undefined && input.access !== "WITH_COMPLETE" && input.access !== "WITHHELD" && input.actor.role !== "SUPER_ADMIN") {
    throw new DeliverableError("Only a super admin can let the client have this chapter on its own.", 403);
  }
  const data: Prisma.ProjectDeliverableUpdateInput = {};
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new DeliverableError("Give the document a name.");
    data.title = title.slice(0, 80);
  }
  if (input.access !== undefined && input.access !== d.access) {
    data.access = input.access;
    data.accessSetById = input.actor.userId;
    data.accessSetAt = new Date();
  }
  if (input.archived !== undefined) data.archivedAt = input.archived ? new Date() : null;
  if (Object.keys(data).length === 0) return;
  await db.projectDeliverable.update({ where: { id: d.id }, data });
}

export async function addDeliverable(input: {
  projectIdOrCode: string;
  title: string;
  access: DeliverableAccess;
  actor: { userId: string; role: string };
}): Promise<{ id: string }> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: input.projectIdOrCode }, { projectId: input.projectIdOrCode }] },
    select: { id: true },
  });
  if (!project) throw new DeliverableError("Project not found", 404);
  if (input.access === "ALWAYS" && input.actor.role !== "SUPER_ADMIN") {
    throw new DeliverableError("Only a super admin can release a document before it is paid for.", 403);
  }
  const title = input.title.trim().slice(0, 80);
  if (!title) throw new DeliverableError("Give the document a name.");
  await ensureDeliverables(project.id);

  for (let attempt = 0; attempt < 3; attempt++) {
    const agg = await db.projectDeliverable.aggregate({ where: { projectId: project.id }, _max: { sortOrder: true }, _count: true });
    const n = agg._count + 1 + attempt;
    try {
      const created = await db.projectDeliverable.create({
        data: {
          projectId: project.id,
          key: `x-${n}`,
          kind: "OTHER",
          title,
          sortOrder: (agg._max.sortOrder ?? 0) + 1,
          access: input.access,
          accessSetById: input.actor.userId,
          accessSetAt: new Date(),
        },
        select: { id: true },
      });
      return created;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new DeliverableError("Couldn't add the document. Try again.", 409);
}

// ── Queues ───────────────────────────────────────────────────

export interface ReviewQueueRow {
  versionId: string;
  projectCode: string;
  projectTitle: string;
  title: string;
  kind: string;
  submittedAt: string;
}

/**
 * Uploads waiting for an admin, oldest first. A complete document still in the quality check is QA's,
 * and a chapter's AI draft is the specialist's to review, so neither is listed here.
 */
const TO_REVIEW: Prisma.DeliverableVersionWhereInput = {
  status: "SUBMITTED",
  deliverable: { archivedAt: null },
  NOT: [
    { deliverable: { kind: "FINAL", project: { status: { in: ["SUBMITTED", "IN_QA_REVIEW", "REVISION_NEEDED"] } } } },
    { submittedByRole: "SYSTEM", deliverable: { kind: "CHAPTER" } },
  ],
};

export async function listVersionsToReview(take = 50): Promise<ReviewQueueRow[]> {
  const rows = await db.deliverableVersion.findMany({
    where: TO_REVIEW,
    orderBy: { createdAt: "asc" },
    take,
    select: {
      id: true,
      createdAt: true,
      deliverable: {
        select: {
          title: true,
          kind: true,
          project: { select: { projectId: true, projectTitle: true, service: { select: { serviceName: true } } } },
        },
      },
    },
  });
  return rows.map((r) => ({
    versionId: r.id,
    projectCode: r.deliverable.project.projectId,
    projectTitle: r.deliverable.project.projectTitle?.trim() || r.deliverable.project.service.serviceName,
    title: r.deliverable.title,
    kind: r.deliverable.kind,
    submittedAt: r.createdAt.toISOString(),
  }));
}

export async function countVersionsToReview(): Promise<number> {
  return db.deliverableVersion.count({ where: TO_REVIEW });
}
