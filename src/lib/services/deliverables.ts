import { Prisma, type DeliverableAccess, type ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { deliverableTemplate, orderedChapters } from "@/lib/deliverables";
import { deliverableGate, type Gate } from "@/lib/files/policy";
import { checkUploadedFile, type UploadedFileInput } from "@/lib/files/register";
import { siteUrl } from "@/lib/site-url";
import { documentReadyMessage, toWaNumber, waLink } from "@/lib/whatsapp";
import { recordUpdate } from "@/lib/services/client-updates";
import { notifyClient, clientProjectPath } from "@/lib/services/client-notify";
import { notifyOperations, notifyUsers } from "@/lib/services/notifications";
import { deliverIfFinalReleased, transitionProject } from "@/lib/services/projects";

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
    public status = 400
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
    })),
    skipDuplicates: true,
  });
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
  file: { select: { id: true, fileName: true, fileSize: true, hiddenFromWorkerAt: true } },
} satisfies Prisma.DeliverableVersionSelect;

export interface VersionView {
  id: string;
  version: number;
  releaseNo: number | null;
  status: "SUBMITTED" | "RELEASED" | "RETURNED" | "SUPERSEDED";
  submittedByRole: string;
  workerNote: string | null;
  reviewNote: string | null;
  createdAt: string;
  releasedAt: string | null;
  fileId: string;
  fileName: string;
  fileSize: number | null;
}

export interface DeliverableView {
  id: string;
  key: string;
  kind: "CHAPTER" | "FINAL" | "OTHER";
  title: string;
  status: "NOT_STARTED" | "IN_REVIEW" | "CHANGES_REQUESTED" | "RELEASED";
  access: DeliverableAccess;
  archived: boolean;
  /** Newest first. */
  versions: VersionView[];
  /** What the client sees for this item right now. */
  gate: Gate;
}

function toVersionView(v: Prisma.DeliverableVersionGetPayload<{ select: typeof versionSelect }>): VersionView {
  return {
    id: v.id,
    version: v.version,
    releaseNo: v.releaseNo,
    status: v.status,
    submittedByRole: v.submittedByRole,
    workerNote: v.workerNote,
    reviewNote: v.reviewNote,
    createdAt: v.createdAt.toISOString(),
    releasedAt: v.releasedAt ? v.releasedAt.toISOString() : null,
    fileId: v.file.id,
    fileName: v.file.fileName,
    fileSize: v.file.fileSize,
  };
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
  const [project, rows] = await Promise.all([
    db.project.findUnique({
      where: { id: projectDbId },
      select: { status: true, downpaymentStatus: true, balanceStatus: true },
    }),
    loadDeliverables(projectDbId, { forWorker: false }),
  ]);
  if (!project) return [];
  return rows.map((d) => ({
    id: d.id,
    key: d.key,
    kind: d.kind,
    title: d.title,
    status: d.status,
    access: d.access,
    archived: d.archivedAt != null,
    versions: d.versions.map(toVersionView),
    gate: deliverableGate(
      d.archivedAt == null && d.versions.some((v) => v.releaseNo != null),
      d.access,
      project
    ),
  }));
}

/** The worker's view: their uploads, admin copies they may see, return notes. No access or payment state. */
export async function listDeliverablesForWorker(projectDbId: string): Promise<Omit<DeliverableView, "gate" | "access">[]> {
  const rows = await loadDeliverables(projectDbId, { forWorker: true });
  return rows.map((d) => ({
    id: d.id,
    key: d.key,
    kind: d.kind,
    title: d.title,
    status: d.status,
    archived: false,
    versions: d.versions.map(toVersionView),
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
    select: { id: true, kind: true, title: true },
  });
  if (!deliverable) throw new DeliverableError("That document isn't part of this project", 404);
  if (!canSubmitDeliverable(deliverable.kind, project.status)) {
    throw new DeliverableError(whySubmitClosed(deliverable.kind, project.status), 409);
  }

  const checked = await checkUploadedFile(input.upload, {
    userId: input.userId,
    projectDbId: project.id,
    purpose: "deliverable",
    targetId: deliverable.id,
  });
  const note = input.note?.trim() || null;

  const versionId = await db.$transaction(
    async (tx) => {
      // One at a time per deliverable while the version number is chosen.
      await tx.$queryRaw`SELECT id FROM "ProjectDeliverable" WHERE id = ${deliverable.id} FOR UPDATE`;
      const last = await tx.deliverableVersion.aggregate({ where: { deliverableId: deliverable.id }, _max: { version: true } });
      const file = await tx.projectFile.create({
        data: {
          projectId: project.id,
          fileName: checked.fileName,
          fileUrl: checked.url,
          fileSize: checked.size,
          fileType: checked.contentType,
          category: "from_worker",
          uploadedBy: input.userId,
          uploaderRole: "WORKER",
          storage: "PRIVATE_BLOB",
          blobPathname: checked.pathname,
          deliverableId: deliverable.id,
        },
        select: { id: true },
      });
      // An upload that was never reviewed is replaced by the newer one.
      await tx.deliverableVersion.updateMany({
        where: { deliverableId: deliverable.id, status: "SUBMITTED" },
        data: { status: "SUPERSEDED" },
      });
      const version = await tx.deliverableVersion.create({
        data: {
          deliverableId: deliverable.id,
          version: (last._max.version ?? 0) + 1,
          fileId: file.id,
          submittedById: input.userId,
          submittedByRole: "WORKER",
          workerNote: note,
        },
        select: { id: true },
      });
      await tx.projectDeliverable.update({ where: { id: deliverable.id }, data: { status: "IN_REVIEW" } });
      return version.id;
    },
    { timeout: 15_000, maxWait: 10_000 }
  ).catch((error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DeliverableError("That upload was already submitted.", 409);
    }
    throw error;
  });

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
  decision: "release" | "return";
  note?: string | null;
  adminUserId: string;
}): Promise<ReviewResult> {
  const version = await db.deliverableVersion.findFirst({
    where: {
      id: input.versionId,
      deliverable: { project: { OR: [{ id: input.projectIdOrCode }, { projectId: input.projectIdOrCode }] } },
    },
    select: {
      id: true,
      status: true,
      deliverable: {
        select: {
          id: true,
          kind: true,
          title: true,
          access: true,
          archivedAt: true,
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

  const releaseNo = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ProjectDeliverable" WHERE id = ${deliverable.id} FOR UPDATE`;
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
      await tx.projectDeliverable.update({ where: { id: deliverable.id }, data: { status: "RELEASED" } });
      const gate = deliverableGate(true, deliverable.access, project);
      await recordUpdate(tx, {
        projectId: project.id,
        kind: "RELEASE",
        title: next > 1 ? `${deliverable.title} (version ${next}) is ready` : `${deliverable.title} is ready`,
        body:
          gate.state === "open"
            ? "Download it from the Documents tab."
            : gate.state === "locked" && gate.reason === "balance"
              ? "It unlocks for download when your balance is paid."
              : "You'll be able to download it from the Documents tab.",
        dedupeKey: `release:${version.id}`,
      });
      return next;
    },
    { timeout: 15_000, maxWait: 10_000 }
  );
  if (releaseNo == null) throw new DeliverableError("Someone already reviewed this upload. Refresh.", 409);

  const gate = deliverableGate(true, deliverable.access, project);
  const isFinal = deliverable.kind === "FINAL";
  await notifyClient(project.id, {
    title: isFinal ? "Your complete project is ready" : `${deliverable.title} is ready`,
    message:
      gate.state === "open"
        ? `${project.projectId}: download it from Documents.`
        : `${project.projectId}: it unlocks when your balance is paid.`,
    type: "success",
    tab: gate.state === "locked" && gate.reason === "balance" ? "payments" : "documents",
    email: {
      kind: "release",
      heading: isFinal ? "Your complete project is ready" : `${deliverable.title} is ready`,
      lines:
        gate.state === "open"
          ? ["It's on your dashboard now. Open the Documents tab to download it."]
          : ["It's on your dashboard. It unlocks for download once your balance is paid, from the Payments tab."],
      ctaLabel: gate.state === "open" ? "Download it" : "Open your project",
    },
  });
  await notifyUsers([project.worker?.userId], {
    title: `${deliverable.title} released`,
    message: `${project.projectId}: ${deliverable.title} was released to the client.`,
    type: "success",
    link: `/worker/projects/${project.projectId}?tab=documents`,
  });

  // Everything paid and the complete document released: that is delivery.
  if (isFinal) await deliverIfFinalReleased(project.id);

  return { released: true, whatsappUrl: await releaseMessage(project.id, deliverable.title, isFinal) };
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
    select: { id: true, projectId: true },
  });
  if (!deliverable) throw new DeliverableError("Document not found", 404);

  const checked = await checkUploadedFile(input.upload, {
    userId: input.adminUserId,
    projectDbId: deliverable.projectId,
    purpose: "deliverable",
    targetId: deliverable.id,
  });

  const versionId = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ProjectDeliverable" WHERE id = ${deliverable.id} FOR UPDATE`;
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

/** Uploads waiting for an admin, oldest first. A complete document still in the quality check is QA's, not listed here. */
export async function listVersionsToReview(take = 50): Promise<ReviewQueueRow[]> {
  const rows = await db.deliverableVersion.findMany({
    where: {
      status: "SUBMITTED",
      deliverable: { archivedAt: null },
      NOT: { deliverable: { kind: "FINAL", project: { status: { in: ["SUBMITTED", "IN_QA_REVIEW", "REVISION_NEEDED"] } } } },
    },
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
  return db.deliverableVersion.count({
    where: {
      status: "SUBMITTED",
      deliverable: { archivedAt: null },
      NOT: { deliverable: { kind: "FINAL", project: { status: { in: ["SUBMITTED", "IN_QA_REVIEW", "REVISION_NEEDED"] } } } },
    },
  });
}
