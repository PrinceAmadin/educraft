import { Prisma, type ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { TransitionError } from "@/lib/services/projects";
import { notifyRole, notifyUsers } from "@/lib/services/notifications";
import { postMessage } from "@/lib/services/client-messages";
import { reconcileProjectPayouts } from "@/lib/services/finance/payouts-engine";
import { monthKeyOf } from "@/lib/services/finance/buckets";
import { WORKER_ACTIVE_STATUSES } from "@/lib/operations/worker-performance";
import { STATUS_META } from "@/lib/status";
import { formatDate } from "@/lib/utils";
import type { Actor } from "@/lib/services/operations/actor";

/**
 * The COO's actions on one project — notes, the internal deadline, the
 * at-risk flag, a senior review, a client update, lineage — and the
 * timeline they build up with the status log.
 */

type Db = Prisma.TransactionClient | typeof db;

export type ProjectNoteKind =
  | "NOTE"
  | "DEADLINE"
  | "AT_RISK"
  | "SENIOR_REVIEW"
  | "REASSIGN"
  | "CORRECTION"
  | "FLAG"
  | "STATUS"
  | "CLIENT_UPDATE"
  | "RESEARCH"
  | "QA";

export async function findProject(idOrCode: string) {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: {
      id: true,
      projectId: true,
      status: true,
      workerId: true,
      internalDeadline: true,
      deliveryDate: true,
      atRisk: true,
      parentProjectId: true,
      worker: { select: { userId: true, fullName: true } },
      client: { select: { fullName: true } },
    },
  });
  if (!project) throw new TransitionError("Project not found");
  return project;
}

/** One dated line on the project. Usable inside a transaction. */
export async function writeProjectNote(
  client: Db,
  projectDbId: string,
  input: { content: string; kind?: ProjectNoteKind; actor?: Actor | null; authorType?: "EXEC" | "WORKER" | "SYSTEM" }
): Promise<void> {
  await client.projectNote.create({
    data: {
      projectId: projectDbId,
      content: input.content,
      kind: input.kind ?? "NOTE",
      authorType: input.authorType ?? (input.actor ? "EXEC" : "SYSTEM"),
      authorId: input.actor?.userId ?? null,
      authorName: input.actor?.name ?? null,
    },
  });
}

export async function addProjectNote(idOrCode: string, actor: Actor, content: string) {
  const project = await findProject(idOrCode);
  const text = content.trim();
  if (!text) throw new TransitionError("Write a note first");
  const note = await db.projectNote.create({
    data: { projectId: project.id, content: text, kind: "NOTE", authorType: "EXEC", authorId: actor.userId, authorName: actor.name },
  });
  return { id: note.id, createdAt: note.createdAt };
}

// ── Timeline ────────────────────────────────────────────────

export interface TimelineEntry {
  id: string;
  at: string;
  kind: "status" | "note";
  noteKind: string | null;
  title: string;
  body: string | null;
  actor: string | null;
  fromStatus: ProjectStatus | null;
  toStatus: ProjectStatus | null;
}

/** Notes and status changes, newest first. */
export async function getProjectTimeline(projectDbId: string, limit = 80): Promise<TimelineEntry[]> {
  const [notes, logs] = await Promise.all([
    db.projectNote.findMany({ where: { projectId: projectDbId }, orderBy: { createdAt: "desc" }, take: limit }),
    db.projectStatusLog.findMany({
      where: { projectId: projectDbId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { changedBy: { select: { displayName: true, email: true, execProfile: { select: { fullName: true } } } } },
    }),
  ]);
  const entries: TimelineEntry[] = [
    ...notes.map((n) => ({
      id: `note:${n.id}`,
      at: n.createdAt.toISOString(),
      kind: "note" as const,
      noteKind: n.kind,
      title: n.kind === "NOTE" ? "Note" : n.kind.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()),
      body: n.content,
      actor: n.authorType === "SYSTEM" ? (n.authorName ? `${n.authorName} · system` : "System") : n.authorName,
      fromStatus: null,
      toStatus: null,
    })),
    ...logs.map((l) => ({
      id: `status:${l.id}`,
      at: l.createdAt.toISOString(),
      kind: "status" as const,
      noteKind: null,
      title: l.fromStatus === l.toStatus ? STATUS_META[l.toStatus].label : `${STATUS_META[l.fromStatus].label} → ${STATUS_META[l.toStatus].label}`,
      body: l.notes,
      actor: l.changedBy ? l.changedBy.execProfile?.fullName ?? l.changedBy.displayName ?? l.changedBy.email : "System",
      fromStatus: l.fromStatus,
      toStatus: l.toStatus,
    })),
  ];
  entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return entries.slice(0, limit);
}

// ── Internal deadline ───────────────────────────────────────

/** YYYY-MM-DD as the end of that day in Lagos. */
export function endOfLagosDay(date: string): Date {
  return new Date(`${date}T23:59:00+01:00`);
}

export async function setInternalDeadline(idOrCode: string, actor: Actor, date: string | null, note?: string) {
  const project = await findProject(idOrCode);
  const next = date ? endOfLagosDay(date) : null;
  const was = project.internalDeadline;
  await db.$transaction(async (tx) => {
    await tx.project.update({ where: { id: project.id }, data: { internalDeadline: next } });
    await writeProjectNote(tx, project.id, {
      kind: "DEADLINE",
      actor,
      authorType: "SYSTEM",
      content: `Internal deadline ${next ? `set to ${formatDate(next)}` : "cleared"}${was ? ` (was ${formatDate(was)})` : ""}${note?.trim() ? ` — ${note.trim()}` : ""}`,
    });
  });
  if (project.worker?.userId && next) {
    await notifyUsers([project.worker.userId], {
      title: "Deadline updated",
      message: `${project.projectId}: the deadline is now ${formatDate(next)}.`,
      type: "warning",
      link: `/worker/projects/${project.projectId}`,
    });
  }
  return { internalDeadline: next?.toISOString() ?? null };
}

// ── At risk ─────────────────────────────────────────────────

export async function setAtRisk(idOrCode: string, actor: Actor, atRisk: boolean, note?: string) {
  const project = await findProject(idOrCode);
  const text = note?.trim() || null;
  await db.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: project.id },
      data: atRisk ? { atRisk: true, atRiskNote: text, atRiskAt: new Date() } : { atRisk: false, atRiskNote: null, atRiskAt: null },
    });
    await writeProjectNote(tx, project.id, {
      kind: "AT_RISK",
      actor,
      authorType: "SYSTEM",
      content: atRisk ? `Flagged at risk${text ? `: ${text}` : ""}` : "At-risk flag cleared",
    });
  });
  return { atRisk };
}

// ── Senior review ───────────────────────────────────────────

export async function requestSeniorReview(idOrCode: string, actor: Actor, note: string) {
  const project = await findProject(idOrCode);
  const text = note.trim();
  await db.$transaction(async (tx) => {
    await tx.project.update({ where: { id: project.id }, data: { seniorReviewRequestedAt: new Date(), seniorReviewNote: text } });
    await writeProjectNote(tx, project.id, { kind: "SENIOR_REVIEW", actor, authorType: "SYSTEM", content: `Marked for senior review: ${text}` });
  });
  await notifyRole("SUPER_ADMIN", {
    title: "Senior review requested",
    message: `${actor.name} asked for a senior look at ${project.projectId}: ${text.slice(0, 140)}`,
    type: "urgent",
    link: `/admin/projects/${project.projectId}`,
  });
  return { ok: true };
}

export async function clearSeniorReview(idOrCode: string, actor: Actor) {
  const project = await findProject(idOrCode);
  await db.$transaction(async (tx) => {
    await tx.project.update({ where: { id: project.id }, data: { seniorReviewRequestedAt: null, seniorReviewNote: null } });
    await writeProjectNote(tx, project.id, { kind: "SENIOR_REVIEW", actor, authorType: "SYSTEM", content: "Senior review closed" });
  });
  return { ok: true };
}

// ── Client update ───────────────────────────────────────────

/** A message to the client through their dashboard thread, noted on the project. */
export async function requestClientUpdate(idOrCode: string, actor: Actor, message: string) {
  const project = await findProject(idOrCode);
  const posted = await postMessage({ projectDbId: project.id, authorUserId: actor.userId, side: "ADMIN", body: message });
  await writeProjectNote(db, project.id, {
    kind: "CLIENT_UPDATE",
    actor,
    authorType: "SYSTEM",
    content: `Client update requested: ${message.trim().slice(0, 300)}`,
  });
  return { messageId: posted.id };
}

// ── Lineage ─────────────────────────────────────────────────

export async function linkParentProject(idOrCode: string, actor: Actor, parentCode: string | null) {
  const project = await findProject(idOrCode);
  let parentId: string | null = null;
  let parentLabel = "";
  if (parentCode) {
    const parent = await db.project.findFirst({
      where: { OR: [{ id: parentCode }, { projectId: parentCode.trim().toUpperCase() }] },
      select: { id: true, projectId: true, parentProjectId: true },
    });
    if (!parent) throw new TransitionError("No project with that code");
    if (parent.id === project.id) throw new TransitionError("A project cannot be its own parent");
    // No cycles: walk up from the chosen parent.
    let cursor = parent.parentProjectId;
    for (let i = 0; cursor && i < 20; i++) {
      if (cursor === project.id) throw new TransitionError("That would make a loop in the project lineage");
      const up: { parentProjectId: string | null } | null = await db.project.findUnique({ where: { id: cursor }, select: { parentProjectId: true } });
      cursor = up?.parentProjectId ?? null;
    }
    parentId = parent.id;
    parentLabel = parent.projectId;
  }
  await db.$transaction(async (tx) => {
    await tx.project.update({ where: { id: project.id }, data: { parentProjectId: parentId } });
    await writeProjectNote(tx, project.id, {
      kind: "NOTE",
      actor,
      authorType: "SYSTEM",
      content: parentId ? `Linked as a follow-on to ${parentLabel}` : "Parent project link removed",
    });
  });
  return { parentProjectId: parentId };
}

// ── Super admin: set any status ─────────────────────────────

/**
 * The founder's override: any status, forwards or back, with a note. Logged
 * like every other change. Nothing else in the app may move a project
 * backwards — an approval, once given, stays given for everyone else.
 */
export async function forceProjectStatus(idOrCode: string, actor: Actor, to: ProjectStatus, note: string) {
  if (actor.role !== "SUPER_ADMIN") throw new TransitionError("Only the super admin can set a status directly");
  const project = await findProject(idOrCode);
  if (project.status === to) throw new TransitionError(`The project is already ${STATUS_META[to].label}`);
  const text = note.trim();
  if (!text) throw new TransitionError("Say why the status is being changed");
  const now = new Date();
  const data: Prisma.ProjectUpdateManyMutationInput = { status: to };
  // Keep the first delivery date (on-time rates are measured on it).
  if (to === "DELIVERED" && !project.deliveryDate) data.deliveryDate = now;
  if (to === "COMPLETED") data.finalCompletionDate = now;
  await db.$transaction(async (tx) => {
    const moved = await tx.project.updateMany({ where: { id: project.id, status: project.status }, data });
    if (moved.count !== 1) throw new TransitionError("This project changed while you were working on it. Refresh and try again.");
    await tx.projectStatusLog.create({
      data: { projectId: project.id, fromStatus: project.status, toStatus: to, changedById: actor.userId, notes: `Set by super admin: ${text}` },
    });
    await writeProjectNote(tx, project.id, { kind: "STATUS", actor, authorType: "SYSTEM", content: `Status set to ${STATUS_META[to].label} by the super admin: ${text}` });
    // The payout ledger follows completion both ways: forced into COMPLETED owes
    // every leg for this month; forced out of it cancels the legs not yet paid.
    if (to === "COMPLETED") await reconcileProjectPayouts(tx, project.id, { month: monthKeyOf(now) });
    else if (project.status === "COMPLETED") await reconcileProjectPayouts(tx, project.id);
  }, { timeout: 15_000, maxWait: 10_000 });
  if (project.worker?.userId) {
    await notifyUsers([project.worker.userId], {
      title: "Project status changed",
      message: `${project.projectId} is now ${STATUS_META[to].label}.`,
      type: "info",
      link: `/worker/projects/${project.projectId}`,
    });
  }
  return { status: to };
}

// ── The ops overview for the detail page ────────────────────

export interface ProjectOps {
  notes: { id: string; content: string; kind: string; authorName: string | null; authorType: string; createdAt: string }[];
  rounds: {
    id: string;
    roundNumber: number;
    clientNote: string | null;
    receivedAt: string;
    deadline: string | null;
    completedAt: string | null;
    status: string;
    escalationNote: string | null;
  }[];
  qaReview: {
    reviewerName: string | null;
    reviewerType: string | null;
    assignedAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    decision: string | null;
    round: number;
    checksDone: number;
    formattingScore: number | null;
    structuralPass: boolean | null;
    referenceVerPass: boolean | null;
    voiceCheckPass: boolean | null;
  } | null;
  parent: { id: string; projectId: string; projectTitle: string | null; status: ProjectStatus } | null;
  children: { id: string; projectId: string; projectTitle: string | null; status: ProjectStatus }[];
  worker: { activeProjects: number; maxConcurrentProjects: number; daysOnProject: number | null; phone: string | null; userId: string | null } | null;
  timeline: TimelineEntry[];
}

export async function getProjectOps(projectDbId: string, now: Date = new Date()): Promise<ProjectOps> {
  const [project, timeline] = await Promise.all([
    db.project.findUnique({
      where: { id: projectDbId },
      select: {
        assignedDate: true,
        notes: { orderBy: { createdAt: "desc" }, take: 40 },
        correctionRounds: { orderBy: { roundNumber: "asc" } },
        qaReview: true,
        parentProject: { select: { id: true, projectId: true, projectTitle: true, status: true } },
        childProjects: { select: { id: true, projectId: true, projectTitle: true, status: true }, orderBy: { createdAt: "asc" } },
        worker: {
          select: {
            phone: true,
            userId: true,
            maxConcurrentProjects: true,
            projects: { where: { status: { in: [...WORKER_ACTIVE_STATUSES] } }, select: { id: true } },
          },
        },
      },
    }),
    getProjectTimeline(projectDbId),
  ]);
  if (!project) throw new TransitionError("Project not found");
  const q = project.qaReview;
  const checklist = (q?.deliveryChecklist ?? {}) as Record<string, unknown>;
  return {
    notes: project.notes.map((n) => ({ id: n.id, content: n.content, kind: n.kind, authorName: n.authorName, authorType: n.authorType, createdAt: n.createdAt.toISOString() })),
    rounds: project.correctionRounds.map((r) => ({
      id: r.id,
      roundNumber: r.roundNumber,
      clientNote: r.clientNote,
      receivedAt: r.receivedAt.toISOString(),
      deadline: r.deadline?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
      status: r.status,
      escalationNote: r.escalationNote,
    })),
    qaReview: q
      ? {
          reviewerName: q.reviewerName,
          reviewerType: q.reviewerType,
          assignedAt: q.assignedAt?.toISOString() ?? null,
          startedAt: q.startedAt?.toISOString() ?? null,
          completedAt: q.completedAt?.toISOString() ?? null,
          decision: q.decision,
          round: q.round,
          checksDone: Object.values(checklist).filter((v) => v === true).length,
          formattingScore: q.formattingScore,
          structuralPass: q.structuralPass,
          referenceVerPass: q.referenceVerPass,
          voiceCheckPass: q.voiceCheckPass,
        }
      : null,
    parent: project.parentProject,
    children: project.childProjects,
    worker: project.worker
      ? {
          activeProjects: project.worker.projects.length,
          maxConcurrentProjects: project.worker.maxConcurrentProjects,
          daysOnProject: project.assignedDate ? Math.floor((now.getTime() - project.assignedDate.getTime()) / 86_400_000) : null,
          phone: project.worker.phone,
          userId: project.worker.userId,
        }
      : null,
    timeline,
  };
}
