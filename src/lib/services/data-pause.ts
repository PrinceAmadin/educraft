/**
 * D3c — the report pipeline's data pauses (what D4's orchestrator calls).
 *
 *   openDataPause        at a pause point: saves the pause and drafts its data request
 *   regenerateDataForm   the COO asks again when a draft failed
 *   getWorkerPauseView   what the worker's banner shows
 *   submitPauseData      the worker sends the files and answers
 *   pauseDataForChapter  what a later chapter gets (text for the prompt, file ids for attachments)
 *   loadDataAttachments  the PDFs and images read back as Claude content blocks
 *   resumeDataPause / cancelDataPause
 *
 * Files live in the private Blob store (purpose "data") as ProjectFile rows
 * (category ch34_data) tied to their pause and slot.
 */

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { checkUploadedFile, type UploadedFileInput } from "@/lib/files/register";
import { deleteStoredFile, readFile } from "@/lib/files/storage";
import { extensionOf } from "@/lib/files/policy";
import { dataFileKind, extractDataText, roughPdfPages, streamToBytes, MAX_EXTRACTED_TOTAL } from "@/lib/files/extract-text";
import { fileHref } from "@/lib/files/links";
import type { AttachmentBlock } from "@/lib/generation/chapter-plan";
import {
  generateDataForm,
  pauseKind,
  pausePointsFor,
  pausesBeforeChapter,
  readFormSpec,
  validateSubmission,
  type DataFormField,
  type DataFormFile,
  type PauseKind,
  type WorkerData,
} from "@/lib/generation/dynamic-data-form";
import { dataInputChecklist } from "@/lib/generation/prompt-loader";
import { getApprovedModeSettings } from "@/lib/services/research-mode";
import { getApprovedBrief } from "@/lib/research/source-stage-actions";
import { notifyOperations, notifyUsers } from "@/lib/services/notifications";

export const DATA_PAUSE_SUBSYSTEM = "data_pause";
/** Claude's per-image limit, and what keeps a chapter request (base64 adds a third) under the API's 32 MB. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHED_BYTES = 18 * 1024 * 1024;
export const MAX_PDF_PAGES = 90;

type Tx = Prisma.TransactionClient;

export class DataPauseError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 409,
    readonly problems: string[] = [],
  ) {
    super(message);
  }
}

async function projectFor(idOrCode: string) {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: {
      id: true,
      projectId: true,
      projectTitle: true,
      client: { select: { department: true } },
      worker: { select: { userId: true } },
    },
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
 * Claude call, inline: D4 calls this from its background runner). Needs the
 * COO-approved mode to pause there and that chapter to be written. Calling it
 * again for the same point returns the pause already there (a failed draft is
 * drafted again).
 */
export async function openDataPause(idOrCode: string, afterChapter: number, actor: OpenPauseActor) {
  const project = await projectFor(idOrCode);
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
  if (pause.formStatus === "READY" || pause.status === "CANCELLED") return pause;
  if (pause.formStatus === "FAILED") {
    await db.pipelinePause.updateMany({ where: { id: pause.id, formStatus: "FAILED" }, data: { formStatus: "GENERATING", formError: null } });
  }
  await draftForm(pause.id);
  return db.pipelinePause.findUniqueOrThrow({ where: { id: pause.id } });
}

/** The COO asks for the request to be drafted again (after a failure, or before the worker has sent anything). */
export async function regenerateDataForm(pauseId: string) {
  const pause = await db.pipelinePause.findUnique({ where: { id: pauseId }, select: { id: true, status: true } });
  if (!pause) throw new DataPauseError("Pause not found", 404);
  if (pause.status !== "OPEN") throw new DataPauseError("The worker has already answered this request, so it can no longer be redrafted.");
  await db.pipelinePause.update({ where: { id: pauseId }, data: { formStatus: "GENERATING", formError: null } });
  await draftForm(pauseId);
  return db.pipelinePause.findUniqueOrThrow({ where: { id: pauseId } });
}

async function draftForm(pauseId: string): Promise<void> {
  const pause = await db.pipelinePause.findUniqueOrThrow({
    where: { id: pauseId },
    select: { id: true, projectId: true, afterChapter: true, kind: true, mode: true, project: { select: { projectId: true, projectTitle: true, client: { select: { department: true } }, worker: { select: { userId: true } } } } },
  });
  const code = pause.project.projectId;
  try {
    const [settings, brief, chapters] = await Promise.all([
      getApprovedModeSettings(pause.projectId),
      getApprovedBrief(db, pause.projectId),
      db.generationCheckpoint.findMany({
        where: { projectId: pause.projectId, status: "COMPLETED", chapterNumber: { in: pause.kind === "SPECIFICATION" ? [1, pause.afterChapter] : [pause.afterChapter] } },
        orderBy: { chapterNumber: "asc" },
        select: { chapterNumber: true, fullOutput: true },
      }),
    ]);
    const kind = pause.kind as PauseKind;
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
      },
      { projectId: pause.projectId, subsystem: DATA_PAUSE_SUBSYSTEM, step: kind === "RESULTS" ? "draft_results_form" : "draft_specification_form" },
    );
    const saved = await db.pipelinePause.updateMany({
      where: { id: pauseId, formStatus: "GENERATING" },
      data: {
        formStatus: "READY",
        formTitle: form.title,
        formDescription: form.description,
        formSpec: form as unknown as Prisma.InputJsonValue,
        formError: null,
        formGeneratedAt: new Date(),
      },
    });
    if (saved.count === 1 && pause.project.worker?.userId) {
      await notifyUsers([pause.project.worker.userId], {
        title: "The report is waiting for your data",
        message: `${code}: ${form.title}. Open the project to see exactly what to upload.`,
        type: "warning",
        link: `/worker/projects/${code}`,
      }).catch(() => {});
    }
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

// ─── What the worker sees ───────────────────────────────────────────────────

export interface SentDataFile {
  id: string;
  slot: string;
  name: string;
  size: number | null;
  href: string;
}

export interface WorkerPauseView {
  id: string;
  afterChapter: number;
  kind: PauseKind;
  status: "OPEN" | "SUBMITTED";
  /** FAILED is shown to the worker as still being prepared; the COO is told the reason. */
  preparing: boolean;
  title: string | null;
  description: string | null;
  checklist: string[];
  files: DataFormFile[];
  fields: DataFormField[];
  answers: Record<string, string>;
  sent: SentDataFile[];
  submittedAt: string | null;
}

const PAUSE_VIEW_SELECT = {
  id: true,
  afterChapter: true,
  kind: true,
  status: true,
  formStatus: true,
  formTitle: true,
  formDescription: true,
  formSpec: true,
  answers: true,
  submittedAt: true,
  files: {
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, pauseSlot: true, fileName: true, fileSize: true, fileUrl: true, storage: true, blobPathname: true },
  },
} satisfies Prisma.PipelinePauseSelect;

type PauseRow = Prisma.PipelinePauseGetPayload<{ select: typeof PAUSE_VIEW_SELECT }>;

function viewFrom(p: PauseRow, routeBase: string): WorkerPauseView {
  const form = p.formStatus === "READY" ? readFormSpec(p.formSpec) : null;
  return {
    id: p.id,
    afterChapter: p.afterChapter,
    kind: p.kind as PauseKind,
    status: p.status === "SUBMITTED" ? "SUBMITTED" : "OPEN",
    preparing: !form,
    title: form ? p.formTitle : null,
    description: form ? p.formDescription : null,
    checklist: form?.checklist ?? [],
    files: form?.files ?? [],
    fields: form?.fields ?? [],
    answers: (p.answers ?? {}) as Record<string, string>,
    sent: p.files.map((f) => ({ id: f.id, slot: f.pauseSlot ?? "", name: f.fileName, size: f.fileSize, href: fileHref({ id: f.id, fileUrl: f.fileUrl, storage: f.storage }, routeBase) ?? "" })),
    submittedAt: p.submittedAt?.toISOString() ?? null,
  };
}

/** The pause the assigned worker must answer now (OPEN), or has answered and is not yet resumed (SUBMITTED). */
export async function getWorkerPauseView(workerId: string, idOrCode: string): Promise<WorkerPauseView | null> {
  const project = await db.project.findFirst({ where: { workerId, OR: [{ id: idOrCode }, { projectId: idOrCode }] }, select: { id: true, projectId: true } });
  if (!project) throw new DataPauseError("Assignment not found", 404);
  const pause = await db.pipelinePause.findFirst({
    where: { projectId: project.id, status: { in: ["OPEN", "SUBMITTED"] } },
    orderBy: { afterChapter: "asc" },
    select: PAUSE_VIEW_SELECT,
  });
  return pause ? viewFrom(pause, `/api/worker/projects/${project.projectId}`) : null;
}

/** Every pause of a project, for the founder and the COO. */
export async function getAdminPauses(idOrCode: string) {
  const project = await projectFor(idOrCode);
  const pauses = await db.pipelinePause.findMany({ where: { projectId: project.id }, orderBy: { afterChapter: "asc" }, select: { ...PAUSE_VIEW_SELECT, formError: true, mode: true, resumedAt: true, cancelledAt: true, createdAt: true } });
  return pauses.map((p) => ({
    ...viewFrom(p, `/api/admin/projects/${project.projectId}`),
    status: p.status,
    formStatus: p.formStatus,
    formError: p.formError,
    mode: p.mode,
    resumedAt: p.resumedAt?.toISOString() ?? null,
    cancelledAt: p.cancelledAt?.toISOString() ?? null,
  }));
}

// ─── What the worker sends ──────────────────────────────────────────────────

export interface SubmitPauseInput {
  pauseId: string;
  answers: Record<string, unknown>;
  /** One entry per slot: a new upload, or a file already sent that stays. */
  files: { slot: string; upload?: UploadedFileInput; keepFileId?: string }[];
}

/**
 * The worker sends (or changes, until the pause is resumed) the data: every
 * upload is checked against its ticket, size and first bytes; PDFs over
 * MAX_PDF_PAGES, images over 5 MB and more than 18 MB of attachments in all
 * are refused; Word, Excel and CSV files are read into text once, here.
 */
export async function submitPauseData(workerId: string, userId: string, idOrCode: string, input: SubmitPauseInput): Promise<WorkerPauseView> {
  const project = await db.project.findFirst({ where: { workerId, OR: [{ id: idOrCode }, { projectId: idOrCode }] }, select: { id: true, projectId: true } });
  if (!project) throw new DataPauseError("Assignment not found", 404);
  const pause = await db.pipelinePause.findFirst({
    where: { id: input.pauseId, projectId: project.id },
    select: { id: true, status: true, formStatus: true, formSpec: true, afterChapter: true, files: { where: { deletedAt: null }, select: { id: true, pauseSlot: true, fileSize: true, fileName: true } } },
  });
  if (!pause) throw new DataPauseError("This project is not waiting for data.", 404);
  if (pause.status !== "OPEN" && pause.status !== "SUBMITTED") throw new DataPauseError("The report has already moved on from this pause.");
  const form = pause.formStatus === "READY" ? readFormSpec(pause.formSpec) : null;
  if (!form) throw new DataPauseError("The data request is still being prepared.");

  const check = validateSubmission(form, input.answers, input.files.map((f) => f.slot));
  if (!check.ok) throw new DataPauseError(check.problems[0], 400, check.problems);

  const created: { slot: string; name: string; size: number; type: string; pathname: string; url: string; text: string | null }[] = [];
  const kept: { id: string; slot: string; size: number; name: string }[] = [];
  try {
    for (const f of input.files) {
      const slot = form.files.find((s) => s.key === f.slot)!;
      if (f.keepFileId) {
        const old = pause.files.find((x) => x.id === f.keepFileId && x.pauseSlot === f.slot);
        if (!old) throw new DataPauseError(`Upload "${slot.label}" again.`, 400);
        kept.push({ id: old.id, slot: f.slot, size: old.fileSize ?? 0, name: old.fileName });
        continue;
      }
      if (!f.upload) throw new DataPauseError(`Upload "${slot.label}".`, 400);
      const ext = extensionOf(f.upload.fileName);
      const format = ext === "jpeg" ? "jpg" : ext;
      if (!slot.formats.includes(format)) throw new DataPauseError(`"${slot.label}" takes ${slot.formats.join(", ").toUpperCase()} only.`, 400);
      const checked = await checkUploadedFile(f.upload, { userId, projectDbId: project.id, purpose: "data", targetId: pause.id });
      const kind = dataFileKind(checked.fileName);
      if (kind === "image" && checked.size > MAX_IMAGE_BYTES) {
        await deleteStoredFile(checked.pathname).catch(() => {});
        throw new DataPauseError(`${checked.fileName} is over 5 MB: send a smaller screenshot.`, 400);
      }
      const stored = await readFile(checked.pathname);
      const bytes = stored ? await streamToBytes(stored.stream) : new Uint8Array();
      if (kind === "document") {
        const pages = roughPdfPages(bytes);
        if (pages !== null && pages > MAX_PDF_PAGES) {
          await deleteStoredFile(checked.pathname).catch(() => {});
          throw new DataPauseError(`${checked.fileName} has about ${pages} pages: send at most ${MAX_PDF_PAGES} (export only the output the chapters need).`, 400);
        }
      }
      const text = kind === "text" ? await extractDataText(checked.fileName, bytes) : null;
      created.push({ slot: f.slot, name: checked.fileName, size: checked.size, type: checked.contentType, pathname: checked.pathname, url: checked.url, text });
    }
  } catch (error) {
    // Nothing is registered unless everything passed: remove what this call stored.
    for (const c of created) await deleteStoredFile(c.pathname).catch(() => {});
    throw error;
  }

  const attached = [...created.filter((c) => dataFileKind(c.name) !== "text"), ...kept.filter((k) => dataFileKind(k.name) !== "text")].reduce((n, c) => n + c.size, 0);
  const textTotal = created.reduce((n, c) => n + (c.text?.length ?? 0), 0);
  if (attached > MAX_ATTACHED_BYTES || textTotal > MAX_EXTRACTED_TOTAL * 2) {
    for (const c of created) await deleteStoredFile(c.pathname).catch(() => {});
    throw new DataPauseError("The files are too large together: keep PDFs and screenshots under 18 MB in all.", 400);
  }

  await db.$transaction(async (tx: Tx) => {
    const moved = await tx.pipelinePause.updateMany({
      where: { id: pause.id, status: { in: ["OPEN", "SUBMITTED"] } },
      data: { status: "SUBMITTED", answers: check.answers as Prisma.InputJsonValue, submittedAt: new Date(), submittedById: userId },
    });
    if (moved.count === 0) throw new DataPauseError("The report has already moved on from this pause.");
    const keepIds = kept.map((k) => k.id);
    await tx.projectFile.updateMany({ where: { pauseId: pause.id, deletedAt: null, id: { notIn: keepIds } }, data: { deletedAt: new Date() } });
    for (const c of created) {
      await tx.projectFile.create({
        data: {
          projectId: project.id,
          fileName: c.name,
          fileUrl: c.url,
          fileSize: c.size,
          fileType: c.type,
          category: "ch34_data",
          uploadedBy: userId,
          uploaderRole: "WORKER",
          storage: "PRIVATE_BLOB",
          blobPathname: c.pathname,
          pauseId: pause.id,
          pauseSlot: c.slot,
          extractedText: c.text,
        },
      });
    }
  }, { timeout: 20_000, maxWait: 10_000 });

  await notifyOperations({
    title: pause.status === "SUBMITTED" ? "Worker changed the data sent" : "Worker sent the data",
    message: `${project.projectId}: the data for the pause after Chapter ${pause.afterChapter} is in. Check it and resume the report.`,
    type: "info",
    link: `/admin/projects/${project.projectId}?tab=report`,
  }).catch(() => {});

  const view = await getWorkerPauseView(workerId, project.id);
  if (!view) throw new DataPauseError("Pause not found", 404);
  return view;
}

// ─── Into the chapters ──────────────────────────────────────────────────────

/**
 * What a chapter gets from the pauses before it (SUBMITTED or RESUMED), in
 * order. Empty for chapters and modes that need no data.
 */
export async function pauseDataForChapter(client: Tx | typeof db, projectDbId: string, mode: number, chapter: number): Promise<WorkerData[]> {
  const points = pausesBeforeChapter(mode, chapter);
  if (points.length === 0) return [];
  const pauses = await client.pipelinePause.findMany({
    where: { projectId: projectDbId, afterChapter: { in: points }, status: { in: ["SUBMITTED", "RESUMED"] } },
    orderBy: { afterChapter: "asc" },
    select: {
      afterChapter: true,
      kind: true,
      formTitle: true,
      formDescription: true,
      formSpec: true,
      answers: true,
      files: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, pauseSlot: true, extractedText: true } },
    },
  });
  return pauses.map((p) => {
    const form = readFormSpec(p.formSpec);
    const answers = (p.answers ?? {}) as Record<string, string>;
    const slotLabel = (key: string | null) => form?.files.find((f) => f.key === key)?.label ?? key ?? "file";
    return {
      afterChapter: p.afterChapter,
      kind: p.kind as PauseKind,
      title: p.formTitle ?? "",
      description: p.formDescription ?? "",
      checklist: form?.checklist ?? [],
      answers: (form?.fields ?? []).filter((f) => answers[f.key]).map((f) => ({ label: f.label, value: answers[f.key] })),
      files: p.files.map((f) => ({
        fileId: f.id,
        name: f.fileName,
        slot: slotLabel(f.pauseSlot),
        kind: dataFileKind(f.fileName) ?? "document",
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

// ─── Moving on ──────────────────────────────────────────────────────────────

/** D4: the COO has checked the data and the report carries on. */
export async function resumeDataPause(pauseId: string): Promise<boolean> {
  const res = await db.pipelinePause.updateMany({ where: { id: pauseId, status: "SUBMITTED" }, data: { status: "RESUMED", resumedAt: new Date() } });
  return res.count === 1;
}

export async function cancelDataPause(pauseId: string): Promise<boolean> {
  const res = await db.pipelinePause.updateMany({ where: { id: pauseId, status: { in: ["OPEN", "SUBMITTED"] } }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  return res.count === 1;
}
