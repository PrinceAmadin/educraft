/**
 * D3c/D4 — the report pipeline's data pauses.
 *
 * Founder's rule (D4): CLIENTS upload the data, SPECIALISTS verify it.
 *
 *   openDataPause        at a pause point: saves the pause and drafts its data request
 *   regenerateDataForm   the COO asks again when a draft failed
 *   getClientPauseView   what the client's banner shows (client-safe fields only)
 *   submitClientData     the client sends files and answers (the pause goes to SUBMITTED)
 *   getPauseReview       what the specialist's card shows (worker, founder, COO)
 *   addSpecialistFiles   the specialist adds their own files (e.g. the analysis they ran)
 *   saveAnswers          the specialist corrects the client's answers
 *   verifyDataPause      the specialist checks it all: RESUMED, the delivery date moves on
 *   requestMoreFiles     back to the client with a note (the date stays frozen)
 *   cancelDataPause      founder/COO: the date moves on, nothing reaches the chapters
 *   pauseDataForChapter  what a later chapter gets (verified pauses only)
 *   loadDataAttachments  the ticked PDFs and images read back as Claude content blocks
 *
 * The client's delivery date freezes when the request becomes visible to them
 * (form READY) and moves on by the days paused when the pause ends. Files live
 * in the private Blob store (purpose "data") as ProjectFile rows (category
 * data_upload) tied to their pause; uploaderRole says who sent each.
 */

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { checkUploadedFile, type UploadedFileInput } from "@/lib/files/register";
import { deleteStoredFile, readFile } from "@/lib/files/storage";
import { dataFileKind, extractDataText, roughPdfPages, streamToBytes, MAX_EXTRACTED_TOTAL } from "@/lib/files/extract-text";
import { fileHref } from "@/lib/files/links";
import type { AttachmentBlock } from "@/lib/generation/chapter-plan";
import {
  checkChapterAttachments,
  generateDataForm,
  MAX_SUBMITTED_FILES,
  ordersDataAnalysis,
  pauseKind,
  pausePointsFor,
  pausesBeforeChapter,
  readFormSpec,
  validateAnswers,
  type AttachmentCandidate,
  type DataFormField,
  type DataFormFile,
  type DataFormSpec,
  type PauseKind,
  type WorkerData,
} from "@/lib/generation/dynamic-data-form";
import { dataInputChecklist } from "@/lib/generation/prompt-loader";
import { pausedDaysBetween, shiftedDeadlines } from "@/lib/pause-clock";
import { getApprovedModeSettings } from "@/lib/services/research-mode";
import { getApprovedBrief } from "@/lib/research/source-stage-actions";
import { notifyOperations, notifyUsers } from "@/lib/services/notifications";
import { notifyClient } from "@/lib/services/client-notify";
import { recordUpdate } from "@/lib/services/client-updates";
import { DATA_PAUSE_CLIENT_TEXT } from "@/lib/client-updates";

export { MAX_ATTACHED_BYTES, MAX_IMAGE_BYTES, MAX_PDF_PAGES } from "@/lib/generation/dynamic-data-form";

export const DATA_PAUSE_SUBSYSTEM = "data_pause";
/** The ProjectFile category of every file sent at a data pause (the spec's DATA_UPLOAD). */
export const DATA_UPLOAD_CATEGORY = "data_upload";


type Tx = Prisma.TransactionClient;
const ACTIVE = ["OPEN", "SUBMITTED"] as const;

export class DataPauseError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 409,
    readonly problems: string[] = [],
  ) {
    super(message);
  }
}

async function projectFor(idOrCode: string) {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: { id: true, projectId: true, projectTitle: true, status: true, worker: { select: { userId: true } } },
  });
  if (!project) throw new DataPauseError("Project not found", 404);
  return project;
}

// ─── Opening a pause and drafting its request ───────────────────────────────

export interface OpenPauseActor {
  userId: string | null;
}

/**
 * Pauses the report after `afterChapter` and drafts the data request (one
 * Claude call, inline: the chapter orchestrator calls this from its background
 * runner). Needs the COO-approved mode to pause there and that chapter to be
 * written. Calling it again for the same point returns the pause already there
 * (a failed draft is drafted again).
 */
export async function openDataPause(idOrCode: string, afterChapter: number, actor: OpenPauseActor) {
  const project = await projectFor(idOrCode);
  // The older pause keeps its own clock: two clocks would add the same days twice.
  if (project.status === "AWAITING_CLIENT_INPUT") {
    throw new DataPauseError("The project is already waiting for the client. Resume it first, then ask for the data files.");
  }
  const settings = await getApprovedModeSettings(project.id).catch(() => {
    throw new DataPauseError("The mode card is not approved, so the report cannot pause for data yet.");
  });
  if (!pausePointsFor(settings.mode).includes(afterChapter)) {
    throw new DataPauseError(`Mode ${settings.mode} does not pause after Chapter ${afterChapter}.`, 400);
  }
  const chapter = await db.generationCheckpoint.findUnique({
    where: { projectId_chapterNumber: { projectId: project.id, chapterNumber: afterChapter } },
    select: { status: true, fullOutput: true },
  });
  if (chapter?.status !== "COMPLETED" || !chapter.fullOutput) {
    throw new DataPauseError(`Chapter ${afterChapter} has not been written yet, so there is nothing to base the data request on.`);
  }

  let pause = await db.pipelinePause.findUnique({ where: { projectId_afterChapter: { projectId: project.id, afterChapter } } });
  if (!pause) {
    pause = await db.pipelinePause
      .create({
        data: {
          projectId: project.id,
          afterChapter,
          kind: pauseKind(settings.mode, afterChapter),
          mode: settings.mode,
          openedById: actor.userId,
        },
      })
      .catch(async () => db.pipelinePause.findUniqueOrThrow({ where: { projectId_afterChapter: { projectId: project.id, afterChapter } } }));
  }
  if (pause.formStatus === "READY" || pause.status !== "OPEN") return pause;
  if (pause.formStatus === "FAILED") {
    await db.pipelinePause.updateMany({ where: { id: pause.id, formStatus: "FAILED" }, data: { formStatus: "GENERATING", formError: null } });
  }
  await draftForm(pause.id);
  return db.pipelinePause.findUniqueOrThrow({ where: { id: pause.id } });
}

/** The COO asks for the request to be drafted again (after a failure, or before the client has sent anything). */
export async function regenerateDataForm(pauseId: string) {
  const pause = await db.pipelinePause.findUnique({ where: { id: pauseId }, select: { id: true, status: true, round: true } });
  if (!pause) throw new DataPauseError("Pause not found", 404);
  if (pause.status !== "OPEN" || pause.round > 1) {
    throw new DataPauseError("The client has already answered this request, so it can no longer be redrafted.");
  }
  const sent = await db.projectFile.count({ where: { pauseId, deletedAt: null, uploaderRole: "CLIENT" } });
  if (sent > 0) throw new DataPauseError("The client has already sent files for this request, so it can no longer be redrafted.");
  await db.pipelinePause.update({ where: { id: pauseId }, data: { formStatus: "GENERATING", formError: null } });
  await draftForm(pauseId);
  return db.pipelinePause.findUniqueOrThrow({ where: { id: pauseId } });
}

async function draftForm(pauseId: string): Promise<void> {
  const pause = await db.pipelinePause.findUniqueOrThrow({
    where: { id: pauseId },
    select: {
      id: true,
      projectId: true,
      afterChapter: true,
      kind: true,
      mode: true,
      round: true,
      clockPausedAt: true,
      project: {
        select: {
          projectId: true,
          projectTitle: true,
          serviceVariantId: true,
          service: { select: { serviceCode: true } },
          worker: { select: { userId: true } },
        },
      },
    },
  });
  const code = pause.project.projectId;
  try {
    const [settings, brief, chapters, variant] = await Promise.all([
      getApprovedModeSettings(pause.projectId),
      getApprovedBrief(db, pause.projectId),
      db.generationCheckpoint.findMany({
        where: { projectId: pause.projectId, status: "COMPLETED", chapterNumber: { in: pause.kind === "SPECIFICATION" ? [1, pause.afterChapter] : [pause.afterChapter] } },
        orderBy: { chapterNumber: "asc" },
        select: { chapterNumber: true, fullOutput: true },
      }),
      pause.project.serviceVariantId
        ? db.serviceVariant.findUnique({ where: { id: pause.project.serviceVariantId }, select: { name: true } })
        : Promise.resolve(null),
    ]);
    const kind = pause.kind as PauseKind;
    const dataFrom = ordersDataAnalysis({ serviceCode: pause.project.service.serviceCode, variantName: variant?.name }) ? "RAW" : "ANALYSED";
    const form = await generateDataForm(
      {
        topic: pause.project.projectTitle ?? "",
        department: settings.department,
        mode: settings.mode,
        kind,
        afterChapter: pause.afterChapter,
        objectives: brief.objectives,
        chapters: chapters.filter((c) => c.fullOutput).map((c) => ({ number: c.chapterNumber, text: c.fullOutput! })),
        checklist: kind === "RESULTS" ? await dataInputChecklist(settings.mode) : [],
        dataFrom,
      },
      { projectId: pause.projectId, subsystem: DATA_PAUSE_SUBSYSTEM, step: kind === "RESULTS" ? "draft_results_form" : "draft_specification_form" },
    );
    const saved = await db.pipelinePause.updateMany({
      where: { id: pauseId, formStatus: "GENERATING", status: "OPEN" },
      data: {
        formStatus: "READY",
        formTitle: form.title,
        formDescription: form.description,
        formSpec: form as unknown as Prisma.InputJsonValue,
        formError: null,
        formGeneratedAt: new Date(),
        // The client's date freezes the moment they can see what to send.
        clockPausedAt: pause.clockPausedAt ?? new Date(),
      },
    });
    if (saved.count === 1) await announceRequest(pause.projectId, pause.id, pause.round, code, pause.project.worker?.userId ?? null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[data pause] could not draft the data request", pauseId, error);
    await db.pipelinePause.updateMany({ where: { id: pauseId, formStatus: "GENERATING" }, data: { formStatus: "FAILED", formError: message.slice(0, 500) } });
    await notifyOperations({
      title: "Data request could not be drafted",
      message: `${code}: ${message.slice(0, 200)} Ask again from the project.`,
      type: "warning",
      link: `/admin/projects/${code}?tab=report`,
    }).catch(() => {});
  }
}

/** The client hears about the request (bell, push, email, feed); the specialist is told it went out. */
async function announceRequest(projectDbId: string, pauseId: string, round: number, code: string, workerUserId: string | null) {
  const t = DATA_PAUSE_CLIENT_TEXT;
  await recordUpdate(db, {
    projectId: projectDbId,
    kind: "REQUEST",
    title: t.requestFeedTitle,
    body: t.requestFeedBody,
    dedupeKey: `data-request:${pauseId}:${round}`,
  }).catch((e) => console.error("[data pause] feed", e));
  await notifyClient(projectDbId, {
    title: t.requestTitle,
    message: t.requestBody,
    type: "warning",
    tab: "progress",
    email: { kind: "data-request", heading: t.requestTitle, lines: [t.requestBody, t.requestWait], ctaLabel: t.requestCta },
  });
  if (workerUserId) {
    await notifyUsers([workerUserId], {
      title: "The report is waiting for the client's data files",
      message: `${code}: the client has been asked for the data. You'll be told when it arrives, to check it.`,
      type: "info",
      link: `/worker/projects/${code}`,
    }).catch(() => {});
  }
}

// ─── Reading a pause ────────────────────────────────────────────────────────

const REVIEW_SELECT = {
  id: true,
  afterChapter: true,
  kind: true,
  mode: true,
  status: true,
  formStatus: true,
  formTitle: true,
  formDescription: true,
  formSpec: true,
  formError: true,
  answers: true,
  round: true,
  workerNote: true,
  submittedAt: true,
  clockPausedAt: true,
  resumedAt: true,
  cancelledAt: true,
  pausedDays: true,
  chapterFileIds: true,
  createdAt: true,
  files: {
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, fileName: true, fileSize: true, fileUrl: true, storage: true, uploaderRole: true, createdAt: true },
  },
} satisfies Prisma.PipelinePauseSelect;

type ReviewRow = Prisma.PipelinePauseGetPayload<{ select: typeof REVIEW_SELECT }>;

export interface PauseFileView {
  id: string;
  name: string;
  size: number | null;
  from: "CLIENT" | "SPECIALIST";
  /** text = read into the chapters as text; document/image = only if ticked. */
  kind: "text" | "document" | "image";
  href: string;
  createdAt: string;
}

/** What the specialist's card (worker page and the founder/COO Report tab) shows. */
export interface PauseReviewView {
  id: string;
  afterChapter: number;
  kind: PauseKind;
  status: "OPEN" | "SUBMITTED" | "RESUMED" | "CANCELLED";
  /** The request is still being drafted (or the draft failed: formError says why, for the COO). */
  preparing: boolean;
  formError: string | null;
  title: string | null;
  description: string | null;
  checklist: string[];
  whatToSend: DataFormFile[];
  fields: DataFormField[];
  answers: Record<string, string>;
  dataFrom: "RAW" | "ANALYSED" | null;
  round: number;
  workerNote: string | null;
  submittedAt: string | null;
  clockPausedAt: string | null;
  resumedAt: string | null;
  pausedDays: number | null;
  chapterFileIds: string[];
  files: PauseFileView[];
}

function formOf(p: { formStatus: string; formSpec: unknown }): DataFormSpec | null {
  return p.formStatus === "READY" ? readFormSpec(p.formSpec) : null;
}

function reviewFrom(p: ReviewRow, routeBase: string): PauseReviewView {
  const form = formOf(p);
  return {
    id: p.id,
    afterChapter: p.afterChapter,
    kind: p.kind as PauseKind,
    status: p.status,
    preparing: !form,
    formError: p.formStatus === "FAILED" ? p.formError : null,
    title: form ? p.formTitle : null,
    description: form ? p.formDescription : null,
    checklist: form?.checklist ?? [],
    whatToSend: form?.files ?? [],
    fields: form?.fields ?? [],
    answers: (p.answers ?? {}) as Record<string, string>,
    dataFrom: form?.dataFrom ?? null,
    round: p.round,
    workerNote: p.workerNote,
    submittedAt: p.submittedAt?.toISOString() ?? null,
    clockPausedAt: p.clockPausedAt?.toISOString() ?? null,
    resumedAt: p.resumedAt?.toISOString() ?? null,
    pausedDays: p.pausedDays,
    chapterFileIds: p.chapterFileIds,
    files: p.files.map((f) => ({
      id: f.id,
      name: f.fileName,
      size: f.fileSize,
      from: f.uploaderRole === "CLIENT" ? "CLIENT" : "SPECIALIST",
      kind: dataFileKind(f.fileName) ?? "document",
      href: fileHref({ id: f.id, fileUrl: f.fileUrl, storage: f.storage }, routeBase) ?? "",
      createdAt: f.createdAt.toISOString(),
    })),
  };
}

/** The pause the assigned worker is dealing with now (OPEN or SUBMITTED), or null. */
export async function getWorkerPauseView(workerId: string, idOrCode: string): Promise<PauseReviewView | null> {
  const project = await db.project.findFirst({ where: { workerId, OR: [{ id: idOrCode }, { projectId: idOrCode }] }, select: { id: true, projectId: true } });
  if (!project) throw new DataPauseError("Assignment not found", 404);
  const pause = await db.pipelinePause.findFirst({
    where: { projectId: project.id, status: { in: [...ACTIVE] } },
    orderBy: { afterChapter: "asc" },
    select: REVIEW_SELECT,
  });
  return pause ? reviewFrom(pause, `/api/worker/projects/${project.projectId}`) : null;
}

/** Every pause of a project, for the founder and the COO. */
export async function getAdminPauses(idOrCode: string): Promise<PauseReviewView[]> {
  const project = await projectFor(idOrCode);
  const pauses = await db.pipelinePause.findMany({ where: { projectId: project.id }, orderBy: { afterChapter: "asc" }, select: REVIEW_SELECT });
  return pauses.map((p) => reviewFrom(p, `/api/admin/projects/${project.projectId}`));
}

// ─── Files sent at a pause ──────────────────────────────────────────────────

interface StoredDataFile {
  name: string;
  size: number;
  type: string;
  pathname: string;
  url: string;
  text: string | null;
}

/** Checks every upload (ticket, size, first bytes) and reads Word/Excel/CSV into text. Deletes what it stored if any check fails. */
async function checkDataFiles(refs: UploadedFileInput[], expect: { userId: string; projectDbId: string; pauseId: string }): Promise<StoredDataFile[]> {
  const stored: StoredDataFile[] = [];
  try {
    for (const ref of refs) {
      const checked = await checkUploadedFile(ref, { userId: expect.userId, projectDbId: expect.projectDbId, purpose: "data", targetId: expect.pauseId });
      stored.push({ name: checked.fileName, size: checked.size, type: checked.contentType, pathname: checked.pathname, url: checked.url, text: null });
      if (dataFileKind(checked.fileName) === "text") {
        const file = await readFile(checked.pathname);
        stored[stored.length - 1].text = file ? await extractDataText(checked.fileName, await streamToBytes(file.stream)) : null;
      }
    }
  } catch (error) {
    for (const s of stored) await deleteStoredFile(s.pathname).catch(() => {});
    throw error;
  }
  const textTotal = stored.reduce((n, s) => n + (s.text?.length ?? 0), 0);
  if (textTotal > MAX_EXTRACTED_TOTAL * 4) {
    for (const s of stored) await deleteStoredFile(s.pathname).catch(() => {});
    throw new DataPauseError("Those spreadsheets and documents hold too much text to use. Send the parts the request asks for.", 400);
  }
  return stored;
}

function fileRows(stored: StoredDataFile[], meta: { projectDbId: string; pauseId: string; userId: string; role: "CLIENT" | "WORKER" | "ADMIN" }) {
  return stored.map((c) => ({
    projectId: meta.projectDbId,
    fileName: c.name,
    fileUrl: c.url,
    fileSize: c.size,
    fileType: c.type,
    category: DATA_UPLOAD_CATEGORY,
    uploadedBy: meta.userId,
    uploaderRole: meta.role,
    storage: "PRIVATE_BLOB" as const,
    blobPathname: c.pathname,
    pauseId: meta.pauseId,
    extractedText: c.text,
  }));
}

export interface ClientSubmitInput {
  pauseId: string;
  files: UploadedFileInput[];
  answers: Record<string, unknown>;
}

/**
 * The client sends their files (1 to 10, already uploaded to the private store
 * with their own tickets) and answers. Only while the pause is OPEN with a ready
 * request; the pause moves to SUBMITTED and the specialist is told to check it.
 */
export async function submitClientData(
  project: { id: string; projectId: string },
  userId: string,
  input: ClientSubmitInput,
): Promise<{ success: true; fileCount: number }> {
  const pause = await db.pipelinePause.findFirst({
    where: { id: input.pauseId, projectId: project.id },
    select: { id: true, status: true, formStatus: true, formSpec: true, round: true, project: { select: { worker: { select: { userId: true } } } } },
  });
  const form = pause ? formOf(pause) : null;
  if (!pause || pause.status !== "OPEN" || !form) throw new DataPauseError("This project is not waiting for your files right now.", 403);
  if (input.files.length === 0) throw new DataPauseError("Add at least one file.", 400);
  if (input.files.length > MAX_SUBMITTED_FILES) throw new DataPauseError(`Send at most ${MAX_SUBMITTED_FILES} files at a time.`, 400);
  const answers = validateAnswers(form, input.answers);
  if (!answers.ok) throw new DataPauseError(answers.problems[0], 400, answers.problems);

  const stored = await checkDataFiles(input.files, { userId, projectDbId: project.id, pauseId: pause.id });
  try {
    await db.$transaction(
      async (tx: Tx) => {
        const moved = await tx.pipelinePause.updateMany({
          where: { id: pause.id, status: "OPEN" },
          data: { status: "SUBMITTED", answers: answers.answers as Prisma.InputJsonValue, submittedAt: new Date(), submittedById: userId },
        });
        if (moved.count === 0) throw new DataPauseError("This request was just answered. Refresh the page.", 409);
        await tx.projectFile.createMany({ data: fileRows(stored, { projectDbId: project.id, pauseId: pause.id, userId, role: "CLIENT" }) });
        await recordUpdate(tx, {
          projectId: project.id,
          kind: "REQUEST",
          title: DATA_PAUSE_CLIENT_TEXT.receivedFeedTitle,
          body: DATA_PAUSE_CLIENT_TEXT.receivedFeedBody,
          dedupeKey: `data-received:${pause.id}:${pause.round}`,
        });
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  } catch (error) {
    for (const s of stored) await deleteStoredFile(s.pathname).catch(() => {});
    throw error;
  }

  const notice = {
    title: "Client data files to check",
    message: `A client has uploaded data files for ${project.projectId}. Please review and verify.`,
    type: "info" as const,
  };
  const workerUserId = pause.project.worker?.userId;
  if (workerUserId) await notifyUsers([workerUserId], { ...notice, link: `/worker/projects/${project.projectId}` }).catch(() => {});
  else await notifyOperations({ ...notice, link: `/admin/projects/${project.projectId}?tab=report` }).catch(() => {});
  return { success: true, fileCount: stored.length };
}

// ─── The specialist's check ─────────────────────────────────────────────────

export interface PauseActor {
  userId: string;
  role: "WORKER" | "ADMIN";
}

async function activePause(projectDbId: string, pauseId: string, statuses: readonly ("OPEN" | "SUBMITTED")[]) {
  const pause = await db.pipelinePause.findFirst({
    where: { id: pauseId, projectId: projectDbId },
    select: {
      id: true,
      afterChapter: true,
      status: true,
      formStatus: true,
      formSpec: true,
      round: true,
      clockPausedAt: true,
      project: { select: { projectId: true } },
      files: { where: { deletedAt: null }, select: { id: true, fileName: true, fileSize: true, blobPathname: true } },
    },
  });
  if (!pause) throw new DataPauseError("Pause not found", 404);
  if (!(statuses as readonly string[]).includes(pause.status)) {
    throw new DataPauseError(pause.status === "OPEN" ? "The client hasn't sent their files yet." : "This pause has moved on. Refresh the page.");
  }
  const form = formOf(pause);
  if (!form) throw new DataPauseError("The data request is still being prepared.");
  return { pause, form };
}

/** The specialist adds their own files (e.g. the SPSS output they produced from the client's raw data). */
export async function addSpecialistFiles(actor: PauseActor, projectDbId: string, pauseId: string, refs: UploadedFileInput[]): Promise<number> {
  const { pause } = await activePause(projectDbId, pauseId, ACTIVE);
  if (refs.length === 0) throw new DataPauseError("Add at least one file.", 400);
  if (refs.length > MAX_SUBMITTED_FILES) throw new DataPauseError(`Add at most ${MAX_SUBMITTED_FILES} files at a time.`, 400);
  const stored = await checkDataFiles(refs, { userId: actor.userId, projectDbId, pauseId: pause.id });
  try {
    await db.projectFile.createMany({ data: fileRows(stored, { projectDbId, pauseId: pause.id, userId: actor.userId, role: actor.role }) });
  } catch (error) {
    for (const s of stored) await deleteStoredFile(s.pathname).catch(() => {});
    throw error;
  }
  return stored.length;
}

/** The specialist corrects the client's answers (checked against the request's questions). */
export async function saveAnswers(projectDbId: string, pauseId: string, answers: Record<string, unknown>): Promise<void> {
  const { pause, form } = await activePause(projectDbId, pauseId, ["SUBMITTED"]);
  const check = validateAnswers(form, answers);
  if (!check.ok) throw new DataPauseError(check.problems[0], 400, check.problems);
  const saved = await db.pipelinePause.updateMany({ where: { id: pause.id, status: "SUBMITTED" }, data: { answers: check.answers as Prisma.InputJsonValue } });
  if (saved.count === 0) throw new DataPauseError("This pause has moved on. Refresh the page.");
}

/** Ends the pause's clock inside a transaction: the dates move on by the days paused. Returns the days. */
async function releaseClock(tx: Tx, projectDbId: string, clockPausedAt: Date | null, now: Date): Promise<number> {
  if (!clockPausedAt) return 0;
  const days = pausedDaysBetween(clockPausedAt, now);
  const project = await tx.project.findUniqueOrThrow({ where: { id: projectDbId }, select: { internalDeadline: true, expectedDeliveryAt: true } });
  const data = shiftedDeadlines(project, days);
  if (Object.keys(data).length) await tx.project.update({ where: { id: projectDbId }, data });
  return days;
}

/**
 * The specialist has checked everything: the pause is RESUMED, the ticked PDFs
 * and images are the ones the chapters get (they must fit one chapter request),
 * and the client's delivery date moves on by the days paused.
 */
export async function verifyDataPause(actor: PauseActor, projectDbId: string, pauseId: string, chapterFileIds: string[]): Promise<{ pausedDays: number }> {
  const { pause } = await activePause(projectDbId, pauseId, ["SUBMITTED"]);
  const ticked = [...new Set(chapterFileIds)];
  const candidates: (AttachmentCandidate & { id: string })[] = [];
  for (const id of ticked) {
    const f = pause.files.find((x) => x.id === id);
    if (!f) throw new DataPauseError("A ticked file is not part of this request. Refresh the page.", 400);
    const kind = dataFileKind(f.fileName);
    if (kind === "text") continue; // read as text anyway
    let pages: number | null = null;
    if (kind === "document" && f.blobPathname) {
      const file = await readFile(f.blobPathname);
      pages = file ? roughPdfPages(await streamToBytes(file.stream)) : null;
    }
    candidates.push({ id, name: f.fileName, kind: kind === "image" ? ("image" as const) : ("document" as const), size: f.fileSize ?? 0, pages });
  }
  const fits = checkChapterAttachments(candidates);
  if (!fits.ok) throw new DataPauseError(fits.problems[0], 400, fits.problems);

  const now = new Date();
  const pausedDays = await db.$transaction(
    async (tx: Tx) => {
      const moved = await tx.pipelinePause.updateMany({
        where: { id: pause.id, status: "SUBMITTED" },
        data: { status: "RESUMED", resumedAt: now, resumedById: actor.userId, chapterFileIds: candidates.map((c) => c.id) },
      });
      if (moved.count === 0) throw new DataPauseError("This pause has moved on. Refresh the page.");
      const days = await releaseClock(tx, projectDbId, pause.clockPausedAt, now);
      await tx.pipelinePause.update({ where: { id: pause.id }, data: { pausedDays: days } });
      await recordUpdate(tx, {
        projectId: projectDbId,
        kind: "REQUEST",
        title: DATA_PAUSE_CLIENT_TEXT.checkedTitle,
        body: DATA_PAUSE_CLIENT_TEXT.checkedBody,
        dedupeKey: `data-verified:${pause.id}`,
      });
      return days;
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
  await notifyClient(projectDbId, { title: DATA_PAUSE_CLIENT_TEXT.checkedTitle, message: `${pause.project.projectId}: ${DATA_PAUSE_CLIENT_TEXT.checkedBody}`, type: "success", tab: "progress" });
  await notifyOperations({
    title: "Client data verified",
    message: `${pause.project.projectId}: the client's data for the pause after Chapter ${pause.afterChapter} is checked; the report can carry on.`,
    type: "info",
    link: `/admin/projects/${pause.project.projectId}?tab=report`,
  }).catch(() => {});
  return { pausedDays };
}

/** Back to the client for more files, with the specialist's note on their banner. The date stays frozen. */
export async function requestMoreFiles(projectDbId: string, pauseId: string, note: string | null): Promise<void> {
  const { pause } = await activePause(projectDbId, pauseId, ["SUBMITTED"]);
  const clean = note?.trim() || null;
  const moved = await db.pipelinePause.updateMany({
    where: { id: pause.id, status: "SUBMITTED" },
    data: { status: "OPEN", round: { increment: 1 }, workerNote: clean },
  });
  if (moved.count === 0) throw new DataPauseError("This pause has moved on. Refresh the page.");
  const t = DATA_PAUSE_CLIENT_TEXT;
  await recordUpdate(db, {
    projectId: projectDbId,
    kind: "REQUEST",
    title: t.moreTitle,
    body: t.moreBody,
    dedupeKey: `data-more:${pause.id}:${pause.round + 1}`,
  }).catch((e) => console.error("[data pause] feed", e));
  await notifyClient(projectDbId, {
    title: t.moreTitle,
    message: clean ? `${pause.project.projectId}: ${clean}` : `${pause.project.projectId}: ${t.moreBody}`,
    type: "warning",
    tab: "progress",
    email: { kind: "data-request", heading: t.moreTitle, lines: [...(clean ? [`Your specialist's note: ${clean}`] : []), t.moreBody, t.requestWait], ctaLabel: t.requestCta },
  });
}

/** Founder/COO: the report no longer waits for this data. The date moves on; nothing from it reaches the chapters. */
export async function cancelDataPause(pauseId: string): Promise<boolean> {
  const pause = await db.pipelinePause.findUnique({ where: { id: pauseId }, select: { id: true, projectId: true, status: true, clockPausedAt: true } });
  if (!pause || !(ACTIVE as readonly string[]).includes(pause.status)) return false;
  const now = new Date();
  const done = await db.$transaction(
    async (tx: Tx) => {
      const moved = await tx.pipelinePause.updateMany({ where: { id: pause.id, status: { in: [...ACTIVE] } }, data: { status: "CANCELLED", cancelledAt: now } });
      if (moved.count === 0) return false;
      const days = await releaseClock(tx, pause.projectId, pause.clockPausedAt, now);
      await tx.pipelinePause.update({ where: { id: pause.id }, data: { pausedDays: days } });
      // Only a client who was asked hears that we no longer need it.
      if (pause.clockPausedAt) {
        await recordUpdate(tx, {
          projectId: pause.projectId,
          kind: "REQUEST",
          title: DATA_PAUSE_CLIENT_TEXT.cancelledTitle,
          body: DATA_PAUSE_CLIENT_TEXT.cancelledBody,
          dedupeKey: `data-cancelled:${pause.id}`,
        });
      }
      return true;
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
  return done;
}

// ─── Into the chapters ──────────────────────────────────────────────────────

/**
 * What a chapter gets from the pauses before it: VERIFIED (RESUMED) pauses
 * only, in order. Word/Excel/CSV go as text; PDFs and images only when the
 * specialist ticked them. Empty for chapters and modes that need no data.
 */
export async function pauseDataForChapter(client: Tx | typeof db, projectDbId: string, mode: number, chapter: number): Promise<WorkerData[]> {
  const points = pausesBeforeChapter(mode, chapter);
  if (points.length === 0) return [];
  const pauses = await client.pipelinePause.findMany({
    where: { projectId: projectDbId, afterChapter: { in: points }, status: "RESUMED" },
    orderBy: { afterChapter: "asc" },
    select: {
      afterChapter: true,
      kind: true,
      formTitle: true,
      formDescription: true,
      formSpec: true,
      answers: true,
      chapterFileIds: true,
      files: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, uploaderRole: true, extractedText: true } },
    },
  });
  return pauses.map((p) => {
    const form = readFormSpec(p.formSpec);
    const answers = (p.answers ?? {}) as Record<string, string>;
    const ticked = new Set(p.chapterFileIds);
    return {
      afterChapter: p.afterChapter,
      kind: p.kind as PauseKind,
      title: p.formTitle ?? "",
      description: p.formDescription ?? "",
      checklist: form?.checklist ?? [],
      answers: (form?.fields ?? []).filter((f) => answers[f.key]).map((f) => ({ label: f.label, value: answers[f.key] })),
      files: p.files
        .map((f) => ({ f, kind: dataFileKind(f.fileName) ?? "document" }))
        .filter(({ f, kind }) => kind === "text" || ticked.has(f.id))
        .map(({ f, kind }) => ({
          fileId: f.id,
          name: f.fileName,
          from: f.uploaderRole === "CLIENT" ? "the client" : "the specialist",
          kind,
          text: f.extractedText,
        })),
    };
  });
}

export interface AttachmentRef {
  fileId: string;
  name: string;
  pathname: string;
  mediaType: string;
}

/** The PDFs and images among a chapter's data, as references frozen on its checkpoint. */
export async function attachmentRefs(client: Tx | typeof db, projectDbId: string, data: WorkerData[]): Promise<AttachmentRef[]> {
  const ids = data.flatMap((d) => d.files.filter((f) => f.kind !== "text" && f.fileId).map((f) => f.fileId!));
  if (ids.length === 0) return [];
  const rows = await client.projectFile.findMany({ where: { id: { in: ids }, projectId: projectDbId, deletedAt: null, storage: "PRIVATE_BLOB" }, select: { id: true, fileName: true, blobPathname: true, fileType: true } });
  return ids.flatMap((id) => {
    const r = rows.find((x) => x.id === id);
    return r?.blobPathname ? [{ fileId: r.id, name: r.fileName, pathname: r.blobPathname, mediaType: r.fileType ?? "application/pdf" }] : [];
  });
}

/** Reads frozen attachments back from the private store as Claude content blocks (the last one marks the cache point). */
export async function loadDataAttachments(refs: AttachmentRef[]): Promise<AttachmentBlock[]> {
  const blocks: AttachmentBlock[] = [];
  for (const ref of refs) {
    const stored = await readFile(ref.pathname);
    if (!stored) throw new DataPauseError(`The data file ${ref.name} is missing from storage.`);
    const data = Buffer.from(await streamToBytes(stored.stream)).toString("base64");
    blocks.push(
      ref.mediaType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data }, title: ref.name }
        : { type: "image", source: { type: "base64", media_type: ref.mediaType === "image/png" ? "image/png" : "image/jpeg", data } },
    );
  }
  return blocks;
}
