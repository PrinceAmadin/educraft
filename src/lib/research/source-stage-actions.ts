/**
 * What the founder and the COO can do with a project's brief (D3b), and what
 * the mode card and chapter generation read from it. Every write takes the
 * project row lock (generation-state.ts) and refuses while the mode card is
 * approved or once a chapter has been generated (403 MODE_LOCKED), exactly
 * like the mode itself.
 */

import { Prisma, type SourceKind, type SourceStageStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { deleteStoredFile } from "@/lib/files/storage";
import type { DownloadableFile } from "@/lib/services/file-access";
import { hasGenerationStarted, isReportTemplate, lockProjectRow } from "@/lib/generation/generation-state";
import { validateObjectives } from "@/lib/generation/objectives-rules";
import { ModeDecisionError, ModeLockedError, ModeNotApprovedError, ModeStateError } from "@/lib/services/mode-errors";
import { writeProjectNote } from "@/lib/services/operations/project-ops";
import type { Actor } from "@/lib/services/operations/actor";
import { readPoints } from "./source-points";
import { placeholderFor, sourceKindForDepartment } from "./source-policy";
import { ACTIVE_STAGE_STATUSES, SOURCE_STAGE_SUBSYSTEM, resumeStatusFor } from "./source-stage";
import { MAX_STAGE_FAILURES, STAGE_STALL_MS, scheduleSourceStage } from "./source-stage-runner";
import { BRIEF_CARD_SELECT, buildBriefView, type BriefView } from "./source-stage-view";

type Tx = Prisma.TransactionClient;
const TX = { timeout: 20_000, maxWait: 10_000 } as const;

async function projectFor(idOrCode: string) {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: {
      id: true,
      projectId: true,
      service: { select: { intakeFormTemplate: true } },
      client: { select: { department: true } },
    },
  });
  if (!project) throw new ModeStateError("Project not found", 404);
  if (!isReportTemplate(project.service.intakeFormTemplate)) {
    throw new ModeStateError("This service is not a written report, so it has no objectives or sources to prepare.");
  }
  return project;
}

/** Inside the transaction, after the row lock: the brief follows the mode card's lock. */
async function assertBriefEditable(tx: Tx, projectDbId: string): Promise<{ department: string | null }> {
  if (await hasGenerationStarted(projectDbId, tx)) {
    throw new ModeLockedError("GENERATION_STARTED", "Chapters have been generated, so the objectives and sources can no longer change.");
  }
  const mode = await tx.researchMode.findUnique({ where: { projectId: projectDbId }, select: { isLocked: true, department: true } });
  if (mode?.isLocked) throw new ModeLockedError("APPROVED", "The mode card has been approved. Reopen it before changing the objectives or sources.");
  return { department: mode?.department ?? null };
}

function schedule(briefId: string): Promise<void> {
  return scheduleSourceStage(briefId).catch((error) => {
    console.error("[source stage] could not start the background run", briefId, error);
  });
}

// ─── Reading ────────────────────────────────────────────────────────────────

/** Naira spent on this project's source stage (drafting, planning, searches, judging). */
export async function sourceStageCost(projectDbId: string): Promise<number> {
  const sum = await db.aiUsageLog.aggregate({ where: { projectId: projectDbId, subsystem: SOURCE_STAGE_SUBSYSTEM }, _sum: { costNaira: true } });
  return Math.round((sum._sum.costNaira ?? 0) * 100) / 100;
}

export async function briefViewFor(
  projectDbId: string,
  opts: { currentDepartment: string | null; locked: boolean },
  client: Tx | typeof db = db,
): Promise<BriefView> {
  const [brief, cost] = await Promise.all([
    client.projectBrief.findUnique({ where: { projectId: projectDbId }, select: BRIEF_CARD_SELECT }),
    sourceStageCost(projectDbId),
  ]);
  return buildBriefView(brief, { costNaira: cost, currentDepartment: opts.currentDepartment, locked: opts.locked });
}

/**
 * Restarts a stage that is waiting (PENDING) or whose run went quiet, from a
 * browser request (the COO's card, the worker's research poll). Never restarts
 * one that stopped after repeated failures: that needs "Carry on".
 */
export async function kickSourceStage(projectIdOrCode: string, now = Date.now()): Promise<boolean> {
  const b = await db.projectBrief.findFirst({
    where: { project: { OR: [{ id: projectIdOrCode }, { projectId: projectIdOrCode }] } },
    select: { id: true, status: true, failedSteps: true, lockedUntil: true, updatedAt: true },
  });
  if (!b || !ACTIVE_STAGE_STATUSES.includes(b.status) || b.failedSteps >= MAX_STAGE_FAILURES) return false;
  if (b.lockedUntil && b.lockedUntil.getTime() > now) return false;
  if (b.status !== "PENDING" && now - b.updatedAt.getTime() < STAGE_STALL_MS) return false;
  await schedule(b.id);
  return true;
}

// ─── The COO's actions ──────────────────────────────────────────────────────

/**
 * Draft objectives (and, for Law or History, find sources): for a project
 * whose research passed before D3b, one still waiting, or one whose department
 * now calls for a different search (the old search is cleared; the 16-search
 * budget is not reset).
 */
export async function startSourceStage(idOrCode: string, actor: Actor): Promise<void> {
  const project = await projectFor(idOrCode);
  const cleared: string[] = [];
  const briefId = await db.$transaction(async (tx) => {
    await lockProjectRow(tx, project.id);
    const { department: modeDepartment } = await assertBriefEditable(tx, project.id);
    const department = modeDepartment ?? project.client.department ?? null;
    const kind = sourceKindForDepartment(department);
    const b = await tx.projectBrief.findUnique({
      where: { projectId: project.id },
      select: { id: true, status: true, failedSteps: true, sourceKind: true, points: true, sources: { select: { pdfPath: true } } },
    });
    if (!b) {
      const created = await tx.projectBrief.create({
        data: { projectId: project.id, status: "DRAFTING_OBJECTIVES", sourceKind: kind, department, startedById: actor.userId },
        select: { id: true },
      });
      await writeProjectNote(tx, project.id, { kind: "MODE", actor, content: `Objectives drafting started${kind ? ` (with a search for ${kind === "CASE" ? "cases" : "archival sources"})` : ""}.` });
      return created.id;
    }
    if (b.status === "PENDING") {
      await tx.projectBrief.update({ where: { id: b.id }, data: { status: "DRAFTING_OBJECTIVES", startedById: actor.userId } });
      return b.id;
    }
    if (ACTIVE_STAGE_STATUSES.includes(b.status) && b.failedSteps < MAX_STAGE_FAILURES) return b.id; // running: make sure it is
    if (b.status === "READY" && kind && b.sourceKind === kind && readPoints(b.points).length === 0) {
      // The search ended with no points to look for: plan them again (the 16-search budget is not reset).
      await tx.projectBrief.update({ where: { id: b.id }, data: { status: "PLANNING_POINTS", cursor: 0, searchedAt: null, failedSteps: 0, lastError: null } });
      await writeProjectNote(tx, project.id, { kind: "MODE", actor, content: "Source search started again: the last run found no points to search." });
      return b.id;
    }
    if (b.status === "READY" && b.sourceKind !== kind) {
      cleared.push(...b.sources.map((s) => s.pdfPath).filter((p): p is string => Boolean(p)));
      await tx.projectSource.deleteMany({ where: { briefId: b.id } });
      await tx.projectBrief.update({
        where: { id: b.id },
        data: {
          sourceKind: kind,
          department,
          points: Prisma.DbNull,
          cursor: 0,
          searchedAt: kind ? null : new Date(),
          status: kind ? "PLANNING_POINTS" : "READY",
          failedSteps: 0,
          lastError: null,
        },
      });
      await writeProjectNote(tx, project.id, {
        kind: "MODE",
        actor,
        content: kind
          ? `Department changed to ${department}: the search now looks for ${kind === "CASE" ? "cases" : "archival sources"}; the earlier results were cleared.`
          : `Department changed to ${department}: no source search is needed; the earlier results were cleared.`,
      });
      return b.id;
    }
    if (b.status === "READY") throw new ModeStateError("The objectives and sources are ready. Use Draft objectives again to redraft the objectives.");
    throw new ModeStateError("The search stopped. Use Carry on to resume it.");
  }, TX);
  await deleteFiles(cleared);
  await schedule(briefId);
}

/** Resumes a stage that stopped after repeated failures (or FAILED), from where it stopped. */
export async function carryOnSourceStage(idOrCode: string, actor: Actor): Promise<void> {
  const project = await projectFor(idOrCode);
  const briefId = await db.$transaction(async (tx) => {
    await lockProjectRow(tx, project.id);
    await assertBriefEditable(tx, project.id);
    const b = await tx.projectBrief.findUnique({
      where: { projectId: project.id },
      select: { id: true, status: true, failedSteps: true, objectives: true, sourceKind: true, points: true, searchedAt: true },
    });
    const stopped = b && (b.status === "FAILED" || (ACTIVE_STAGE_STATUSES.includes(b.status) && b.failedSteps >= MAX_STAGE_FAILURES));
    if (!b || !stopped) throw new ModeStateError("The search has not stopped, so there is nothing to carry on.");
    const status: SourceStageStatus = b.status === "FAILED" ? resumeStatusFor(b) : b.status;
    await tx.projectBrief.update({ where: { id: b.id }, data: { status, failedSteps: 0, lastError: null, lockedUntil: null } });
    await writeProjectNote(tx, project.id, { kind: "MODE", actor, content: "Objectives and source search resumed." });
    return b.id;
  }, TX);
  await schedule(briefId);
}

/** Drafts the objectives again (one Claude call; no searches). The sources stay as they are. */
export async function redraftObjectives(idOrCode: string, actor: Actor): Promise<void> {
  const project = await projectFor(idOrCode);
  const briefId = await db.$transaction(async (tx) => {
    await lockProjectRow(tx, project.id);
    await assertBriefEditable(tx, project.id);
    const b = await tx.projectBrief.findUnique({ where: { projectId: project.id }, select: { id: true, status: true } });
    if (!b || b.status !== "READY") throw new ModeStateError("The objectives can be drafted again once the current run has finished.");
    await tx.projectBrief.update({ where: { id: b.id }, data: { status: "DRAFTING_OBJECTIVES", redraftOnly: true, failedSteps: 0, lastError: null } });
    await writeProjectNote(tx, project.id, { kind: "MODE", actor, content: "Objectives sent back to be drafted again." });
    return b.id;
  }, TX);
  await schedule(briefId);
}

export interface ManualSourceInput {
  pointIndex: number;
  title: string;
  court?: string | null;
  decidedOn?: string | null;
  citation?: string | null;
  holder?: string | null;
  reference?: string | null;
  url?: string | null;
}

/** A case or record the COO knows of, added under a point. Ticked; marked "Added by the COO". */
export async function addManualSource(idOrCode: string, input: ManualSourceInput, actor: Actor): Promise<void> {
  const project = await projectFor(idOrCode);
  await db.$transaction(async (tx) => {
    await lockProjectRow(tx, project.id);
    await assertBriefEditable(tx, project.id);
    const b = await tx.projectBrief.findUnique({ where: { projectId: project.id }, select: { id: true, status: true, sourceKind: true, points: true } });
    if (!b || b.status !== "READY" || !b.sourceKind) throw new ModeStateError("Sources can be added once the search has finished, on Law and History projects.");
    const point = readPoints(b.points).find((p) => p.index === input.pointIndex);
    if (!point) throw new ModeDecisionError(["Pick the point this source supports."]);
    const clean = (v: string | null | undefined) => (v?.replace(/\s+/g, " ").trim() ? v.replace(/\s+/g, " ").trim() : null);
    await tx.projectSource.create({
      data: {
        projectId: project.id,
        briefId: b.id,
        kind: b.sourceKind,
        origin: "COO",
        pointIndex: point.index,
        title: clean(input.title)!,
        court: b.sourceKind === "CASE" ? clean(input.court) : null,
        decidedOn: clean(input.decidedOn),
        citation: b.sourceKind === "CASE" ? clean(input.citation) : null,
        holder: b.sourceKind === "ARCHIVE" ? clean(input.holder) : null,
        reference: b.sourceKind === "ARCHIVE" ? clean(input.reference) : null,
        recordType: b.sourceKind === "ARCHIVE" ? "Primary" : null,
        sourceUrl: clean(input.url),
        selected: true,
        addedById: actor.userId,
      },
    });
    await writeProjectNote(tx, project.id, { kind: "MODE", actor, content: `${b.sourceKind === "CASE" ? "Case" : "Source"} added by hand for point ${point.index + 1}: ${clean(input.title)}.` });
  }, TX);
}

/** Removes a source the COO added by hand (found ones are unticked instead). */
export async function removeManualSource(idOrCode: string, sourceId: string, actor: Actor): Promise<void> {
  const project = await projectFor(idOrCode);
  await db.$transaction(async (tx) => {
    await lockProjectRow(tx, project.id);
    await assertBriefEditable(tx, project.id);
    const row = await tx.projectSource.findFirst({ where: { id: sourceId, projectId: project.id }, select: { id: true, title: true, addedById: true } });
    if (!row) throw new ModeStateError("Source not found", 404);
    if (!row.addedById) throw new ModeStateError("Only a source added by hand can be removed; untick a found one instead.");
    await tx.projectSource.delete({ where: { id: row.id } });
    await writeProjectNote(tx, project.id, { kind: "MODE", actor, content: `Hand-added source removed: ${row.title}.` });
  }, TX);
}

async function deleteFiles(paths: string[]): Promise<void> {
  for (const p of paths) await deleteStoredFile(p).catch((error) => console.error("[source stage] could not delete", p, error));
}

// ─── Saved with the mode card (research-mode.ts) ────────────────────────────

export interface BriefChoices {
  objectives?: string[];
  selectedSourceIds?: string[];
}

export interface BriefSummary {
  objectives: string[];
  kind: SourceKind | null;
  ticked: number;
  total: number;
  unsupported: number;
}

/**
 * Saves the COO's objectives and ticks, inside the mode card's transaction
 * (after its lock and its changeability check). Approving also requires a
 * finished stage for the department on the card and 3–5 valid objectives.
 * While the stage is still running, a draft save leaves the brief alone.
 */
export async function saveBriefChoices(
  tx: Tx,
  projectDbId: string,
  choices: BriefChoices,
  opts: { approving: boolean; department: string },
): Promise<BriefSummary | null> {
  const b = await tx.projectBrief.findUnique({
    where: { projectId: projectDbId },
    select: { id: true, status: true, failedSteps: true, sourceKind: true, objectives: true, points: true, sources: { select: { id: true, pointIndex: true } } },
  });
  if (!b) {
    if (opts.approving) throw new ModeDecisionError(["Draft the objectives first: press Draft objectives."]);
    return null;
  }
  if (b.status !== "READY") {
    if (opts.approving) {
      const stopped = b.status === "FAILED" || b.failedSteps >= MAX_STAGE_FAILURES;
      throw new ModeDecisionError([stopped ? "The objectives and source search stopped. Press Carry on." : "The objectives and sources are still being prepared."]);
    }
    return null;
  }
  const expected = sourceKindForDepartment(opts.department);
  if (opts.approving && expected !== b.sourceKind) {
    throw new ModeDecisionError([
      expected
        ? `The department now calls for ${expected === "CASE" ? "cases" : "archival sources"}: press Start again to search for them.`
        : "The department no longer needs a source search: press Start again to clear it.",
    ]);
  }

  let objectives = b.objectives;
  if (choices.objectives) {
    const check = validateObjectives(choices.objectives);
    if (!check.ok) throw new ModeDecisionError(check.problems);
    objectives = check.objectives;
  } else if (opts.approving) {
    const check = validateObjectives(objectives);
    if (!check.ok) throw new ModeDecisionError(check.problems);
  }
  await tx.projectBrief.update({ where: { id: b.id }, data: { objectives } });

  let selectedIds = new Set<string>();
  if (choices.selectedSourceIds) {
    const own = new Set(b.sources.map((s) => s.id));
    selectedIds = new Set(choices.selectedSourceIds.filter((id) => own.has(id)));
    await tx.projectSource.updateMany({ where: { briefId: b.id, id: { in: [...selectedIds] } }, data: { selected: true } });
    await tx.projectSource.updateMany({ where: { briefId: b.id, id: { notIn: [...selectedIds] } }, data: { selected: false } });
  } else {
    const rows = await tx.projectSource.findMany({ where: { briefId: b.id, selected: true }, select: { id: true } });
    selectedIds = new Set(rows.map((r) => r.id));
  }
  const points = readPoints(b.points);
  const supported = new Set(b.sources.filter((s) => selectedIds.has(s.id)).map((s) => s.pointIndex));
  return {
    objectives,
    kind: b.sourceKind,
    ticked: selectedIds.size,
    total: b.sources.length,
    unsupported: b.sourceKind ? points.filter((p) => !supported.has(p.index)).length : 0,
  };
}

/** The line the approval note carries about the brief. */
export function briefApprovalNote(s: BriefSummary): string {
  const objectives = s.objectives.map((o, i) => `${i + 1}. ${o}`).join("; ");
  let text = ` Objectives: ${objectives}.`;
  if (s.kind) {
    const what = s.kind === "CASE" ? "Cases" : "Archival sources";
    text += ` ${what} ticked: ${s.ticked} of ${s.total}.`;
    if (s.unsupported) text += ` ${s.unsupported} point${s.unsupported === 1 ? "" : "s"} left as ${placeholderFor(s.kind)}.`;
  }
  return text;
}

// ─── For generation ─────────────────────────────────────────────────────────

export interface ApprovedSource {
  id: string;
  kind: SourceKind;
  pointIndex: number;
  point: string;
  title: string;
  court: string | null;
  decidedOn: string | null;
  citation: string | null;
  suitNumber: string | null;
  holder: string | null;
  reference: string | null;
  recordType: string | null;
}

export interface ApprovedBrief {
  objectives: string[];
  kind: SourceKind | null;
  sources: ApprovedSource[];
  /** Points no ticked source supports: the chapters write the placeholder there. */
  unsupportedPoints: string[];
}

/**
 * The approved objectives and ticked sources. The caller must already hold
 * the approved mode (lockApprovedMode or getApprovedModeSettings): the brief
 * is approved together with it.
 */
export async function getApprovedBrief(client: Tx | typeof db, projectDbId: string): Promise<ApprovedBrief> {
  const b = await client.projectBrief.findUnique({
    where: { projectId: projectDbId },
    select: {
      status: true,
      sourceKind: true,
      objectives: true,
      points: true,
      sources: {
        where: { selected: true },
        orderBy: [{ pointIndex: "asc" }, { createdAt: "asc" }],
        select: { id: true, kind: true, pointIndex: true, title: true, court: true, decidedOn: true, citation: true, suitNumber: true, holder: true, reference: true, recordType: true },
      },
    },
  });
  if (!b || b.status !== "READY") throw new ModeNotApprovedError("The objectives have not been drafted and approved yet.");
  const check = validateObjectives(b.objectives);
  if (!check.ok) throw new ModeNotApprovedError("The approved objectives are not valid; reopen the mode card and fix them.");
  const points = readPoints(b.points);
  const text = new Map(points.map((p) => [p.index, p.text]));
  const sources = b.sources.map((s) => ({ ...s, point: text.get(s.pointIndex) ?? "" }));
  const supported = new Set(sources.map((s) => s.pointIndex));
  return {
    objectives: b.objectives,
    kind: b.sourceKind,
    sources,
    unsupportedPoints: b.sourceKind ? points.filter((p) => !supported.has(p.index)).map((p) => p.text) : [],
  };
}

/** The stored judgment PDF of a source (or the court's own link), for the admin download route. */
export async function sourceFileForAdmin(idOrCode: string, sourceId: string): Promise<DownloadableFile | null> {
  const project = await db.project.findFirst({ where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] }, select: { id: true, projectId: true } });
  if (!project) return null;
  const s = await db.projectSource.findFirst({ where: { id: sourceId, projectId: project.id }, select: { id: true, title: true, pdfPath: true, officialUrl: true } });
  if (!s || (!s.pdfPath && !s.officialUrl)) return null;
  const name = `${project.projectId} ${s.title}`.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return {
    id: s.id,
    fileName: `${name}.pdf`,
    fileUrl: s.officialUrl ?? "",
    fileType: "application/pdf",
    fileSize: null,
    storage: s.pdfPath ? "PRIVATE_BLOB" : "EXTERNAL_LINK",
    blobPathname: s.pdfPath,
  };
}
