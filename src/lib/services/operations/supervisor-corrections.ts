import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { TransitionError } from "@/lib/services/projects";
import { notifyRole, notifyUsers } from "@/lib/services/notifications";
import { CORRECTION_LIMIT_MESSAGE, DEFAULT_CORRECTION_DAYS, MAX_CORRECTION_ROUNDS, correctionLimitReached, roundsSoFar } from "@/lib/operations/corrections";
import { findProject, writeProjectNote } from "@/lib/services/operations/project-ops";
import type { Actor } from "@/lib/services/operations/actor";

/**
 * Supervisor correction rounds. `transitionProject` opens a round on the way
 * into SUPERVISOR_CORRECTIONS and completes it on the way back to DELIVERED;
 * the COO's own acts (reminder, escalation) live here.
 */

type Db = Prisma.TransactionClient | typeof db;

/** How many rounds the project has had, counting the older counter for projects from before the table existed. */
export async function countRounds(client: Db, projectDbId: string): Promise<number> {
  const [table, project] = await Promise.all([
    client.supervisorCorrection.count({ where: { projectId: projectDbId } }),
    client.project.findUnique({ where: { id: projectDbId }, select: { supervisorCorrectionCount: true } }),
  ]);
  return roundsSoFar(table, project?.supervisorCorrectionCount ?? 0);
}

/** Throws when a further round would be out of scope. Called before the move into SUPERVISOR_CORRECTIONS. */
export async function assertRoundAllowed(client: Db, projectDbId: string): Promise<void> {
  const [table, project] = await Promise.all([
    client.supervisorCorrection.count({ where: { projectId: projectDbId } }),
    client.project.findUnique({ where: { id: projectDbId }, select: { supervisorCorrectionCount: true } }),
  ]);
  if (correctionLimitReached(table, project?.supervisorCorrectionCount ?? 0)) throw new TransitionError(CORRECTION_LIMIT_MESSAGE);
}

/** Opens the next round inside the transaction that moves the project into SUPERVISOR_CORRECTIONS. */
export async function openCorrectionRound(
  tx: Prisma.TransactionClient,
  projectDbId: string,
  input: { clientNote: string | null; createdById: string | null; now: Date; deadline?: Date | null }
): Promise<{ roundNumber: number }> {
  const roundNumber = (await countRounds(tx, projectDbId)) + 1;
  await tx.supervisorCorrection.create({
    data: {
      projectId: projectDbId,
      roundNumber,
      clientNote: input.clientNote,
      receivedAt: input.now,
      deadline: input.deadline === undefined ? new Date(input.now.getTime() + DEFAULT_CORRECTION_DAYS * 86_400_000) : input.deadline,
      status: "IN_PROGRESS",
      createdById: input.createdById,
    },
  });
  await writeProjectNote(tx, projectDbId, {
    kind: "CORRECTION",
    authorType: "SYSTEM",
    content: `Supervisor corrections received — round ${roundNumber} of ${MAX_CORRECTION_ROUNDS}${input.clientNote ? `: ${input.clientNote.slice(0, 300)}` : ""}`,
  });
  return { roundNumber };
}

/** Marks the open round done when the project goes back to DELIVERED. */
export async function completeOpenRound(tx: Prisma.TransactionClient, projectDbId: string, now: Date): Promise<void> {
  const open = await tx.supervisorCorrection.findFirst({
    where: { projectId: projectDbId, status: "IN_PROGRESS" },
    orderBy: { roundNumber: "desc" },
    select: { id: true, roundNumber: true },
  });
  if (!open) return;
  await tx.supervisorCorrection.update({ where: { id: open.id }, data: { status: "COMPLETED", completedAt: now } });
  await writeProjectNote(tx, projectDbId, { kind: "CORRECTION", authorType: "SYSTEM", content: `Corrections round ${open.roundNumber} completed and re-delivered` });
}

export interface CorrectionRoundView {
  id: string;
  roundNumber: number;
  clientNote: string | null;
  receivedAt: string;
  deadline: string | null;
  completedAt: string | null;
  status: string;
  escalationNote: string | null;
}

export async function listCorrectionRounds(projectDbId: string): Promise<CorrectionRoundView[]> {
  const rows = await db.supervisorCorrection.findMany({ where: { projectId: projectDbId }, orderBy: { roundNumber: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    roundNumber: r.roundNumber,
    clientNote: r.clientNote,
    receivedAt: r.receivedAt.toISOString(),
    deadline: r.deadline?.toISOString() ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    status: r.status,
    escalationNote: r.escalationNote,
  }));
}

/** A nudge to the worker on the open round. */
export async function sendCorrectionReminder(idOrCode: string, actor: Actor) {
  const project = await findProject(idOrCode);
  if (project.status !== "SUPERVISOR_CORRECTIONS") throw new TransitionError("This project is not in supervisor corrections");
  if (!project.worker?.userId) throw new TransitionError("The worker has no login to notify — message them on WhatsApp instead");
  const open = await db.supervisorCorrection.findFirst({ where: { projectId: project.id, status: "IN_PROGRESS" }, orderBy: { roundNumber: "desc" } });
  await notifyUsers([project.worker.userId], {
    title: "Reminder: supervisor corrections",
    message: `${project.projectId}: the corrections${open?.roundNumber ? ` (round ${open.roundNumber})` : ""} are waiting on you${open?.deadline ? ` — due ${open.deadline.toDateString()}` : ""}.`,
    type: "warning",
    link: `/worker/projects/${project.projectId}`,
  });
  await writeProjectNote(db, project.id, { kind: "CORRECTION", actor, authorType: "SYSTEM", content: `Reminder sent to ${project.worker.fullName}` });
  return { ok: true };
}

/** The COO declares the corrections out of scope: the round is marked escalated and the founder decides on a new order. */
export async function escalateCorrections(idOrCode: string, actor: Actor, note: string) {
  const project = await findProject(idOrCode);
  if (project.status !== "SUPERVISOR_CORRECTIONS") throw new TransitionError("This project is not in supervisor corrections");
  const text = note.trim();
  const open = await db.supervisorCorrection.findFirst({ where: { projectId: project.id, status: "IN_PROGRESS" }, orderBy: { roundNumber: "desc" } });
  await db.$transaction(async (tx) => {
    if (open) await tx.supervisorCorrection.update({ where: { id: open.id }, data: { status: "ESCALATED", escalationNote: text } });
    await writeProjectNote(tx, project.id, {
      kind: "CORRECTION",
      actor,
      authorType: "SYSTEM",
      content: `Escalated as out of scope${open ? ` (round ${open.roundNumber})` : ""}: ${text}`,
    });
  });
  await notifyRole("SUPER_ADMIN", {
    title: "Corrections escalated — out of scope",
    message: `${actor.name} escalated ${project.projectId}: ${text.slice(0, 140)}. A new service order may be needed.`,
    type: "urgent",
    link: `/admin/projects/${project.projectId}`,
  });
  return { ok: true };
}
