/**
 * D3b — the source stage, one resumable step at a time (driven by
 * source-stage-runner.ts):
 *
 *   PENDING → DRAFTING_OBJECTIVES → PLANNING_POINTS → SEARCHING → READY
 *
 * Every report project drafts its 3–5 objectives. Law departments then search
 * for cases, History for archival sources (source-policy.ts); every other
 * department goes straight to READY. SEARCHING runs two phases per unit, so a
 * paid search is saved before anything that could fail after it:
 *   Law      cursor = point × 2 + phase  (0: web search, 1: confirm + save)
 *   History  cursor = round × 2 + phase  (0: catalogue queries, 1: judge + save)
 * Searches are reserved against the project's 16 before a call and the unused
 * part refunded after it, so a crash can never overspend. Each step is
 * compare-and-set on status and cursor: a repeat of a finished step writes
 * nothing.
 *
 * Nothing starts a stage on its own: the founder or the COO presses Draft
 * objectives (or Draft again, or Carry on) on the Report tab
 * (source-stage-actions.ts). Research passing, opening the card, the worker's
 * research poll and a mode change never do.
 */

import crypto from "crypto";
import type { Prisma, SourceOrigin, SourceStageStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { AiUsageContext } from "@/lib/ai-usage-log";
import { WebSearchCallError } from "@/lib/anthropic";
import { buildPrivatePath } from "@/lib/files/paths";
import { putPrivateFile } from "@/lib/files/storage";
import { draftAim, draftObjectives, extractClientStatedAim, extractClientStatedObjectives } from "@/lib/generation/objectives-drafter";
import { getDegreeFromDepartment } from "@/lib/generation/department-map";
import { isModeNumber } from "@/lib/mode-classifier";
import { notifyOperations } from "@/lib/services/notifications";
import { newCheckLease, requestObjectivesCheck } from "./objectives-check";
import { judgeArchiveResults, planArchivePoints, runArchiveQuery, type ArchiveAttempt, type JudgeInput } from "./archive-fetcher";
import { planLegalPoints, searchCasesForPoint, type FoundCase, type SourceContext } from "./legal-source-fetcher";
import { readPoints, type StoredPoint } from "./source-points";
import {
  ATTEMPTS_PER_POINT,
  OFFICIAL_LOOKUP_LIMIT,
  SOURCE_SEARCH_LIMIT,
  webSearchesForPoint,
  type ArchiveRecord,
} from "./source-policy";
import { confirmCase, downloadJudgmentPdf, type CourtJudgment } from "./sources/supreme-court";

export const SOURCE_STAGE_SUBSYSTEM = "source_stage";
export const ACTIVE_STAGE_STATUSES: SourceStageStatus[] = ["PENDING", "DRAFTING_OBJECTIVES", "PLANNING_POINTS", "SEARCHING"];
/** Records one catalogue query may hand to the judge. */
const RECORDS_PER_QUERY = 8;

export class YieldToNextSlice extends Error {
  constructor() {
    super("Not enough time left in this slice for the next step");
  }
}

/** A step that cannot succeed as things stand (`fatal`: retrying will not help). */
export class SourceStageError extends Error {
  constructor(
    message: string,
    readonly fatal = false,
  ) {
    super(message);
  }
}

export { readPoints, type StoredPoint } from "./source-points";

const asJson = (v: unknown) => v as Prisma.InputJsonValue;

export interface SearchLogEntry {
  at: string;
  point: number | null;
  source: string;
  queries: string[];
  searches: number;
  results: number;
  kept: number;
  dropped?: { caseName: string; reason: string }[];
  error?: string;
}

function appendLog(json: Prisma.JsonValue | null, entries: SearchLogEntry[]): Prisma.InputJsonValue {
  const list = Array.isArray(json) ? json : [];
  return asJson([...list, ...entries].slice(-200));
}

// ─── Timing (the runner only starts a step that fits before its deadline) ───

export function stepEstimateMs(status: SourceStageStatus, kind: "CASE" | "ARCHIVE" | null, cursor: number): number {
  switch (status) {
    case "PENDING":
      return 1_000;
    case "DRAFTING_OBJECTIVES":
    case "PLANNING_POINTS":
      return 45_000;
    case "SEARCHING":
      // A web search call is capped at 100 s; catalogue rounds wait 1 s between calls to one host.
      if (kind === "CASE") return cursor % 2 === 0 ? 105_000 : 60_000;
      return cursor % 2 === 0 ? 70_000 : 45_000;
    default:
      return 0;
  }
}

// ─── Context ────────────────────────────────────────────────────────────────

const BRIEF_SELECT = {
  id: true,
  projectId: true,
  status: true,
  sourceKind: true,
  department: true,
  objectives: true,
  points: true,
  searchesUsed: true,
  officialLookups: true,
  searchLog: true,
  cursor: true,
  redraftOnly: true,
  project: {
    select: {
      projectId: true,
      projectTitle: true,
      specialInstructions: true,
      departmentOutline: true,
      projectType: true,
      dataRequirements: true,
      intakeModeAnswer: true,
      client: { select: { department: true, university: { select: { name: true } } } },
      researchMode: { select: { department: true, modeNumber: true } },
    },
  },
} satisfies Prisma.ProjectBriefSelect;

type StageBrief = Prisma.ProjectBriefGetPayload<{ select: typeof BRIEF_SELECT }>;

function usage(brief: StageBrief, step: string): AiUsageContext {
  return { projectId: brief.projectId, subsystem: SOURCE_STAGE_SUBSYSTEM, step };
}

function departmentOf(brief: StageBrief): string {
  return brief.project.researchMode?.department ?? brief.department ?? brief.project.client.department ?? "";
}

function sourceContext(brief: StageBrief): SourceContext {
  const topic = brief.project.projectTitle?.trim();
  if (!topic) throw new SourceStageError("The project has no title, so there is nothing to draft objectives for.", true);
  return {
    topic,
    department: departmentOf(brief),
    objectives: brief.objectives,
    universityName: brief.project.client.university?.name ?? null,
  };
}

// ─── The budget ─────────────────────────────────────────────────────────────

/** Takes up to `want` searches from the project's 16, atomically; returns how many it got. */
async function reserveSearches(briefId: string, want: number): Promise<number> {
  for (let n = Math.min(want, SOURCE_SEARCH_LIMIT); n >= 1; n--) {
    const res = await db.projectBrief.updateMany({
      where: { id: briefId, searchesUsed: { lte: SOURCE_SEARCH_LIMIT - n } },
      data: { searchesUsed: { increment: n } },
    });
    if (res.count === 1) return n;
  }
  return 0;
}

async function refundSearches(briefId: string, n: number): Promise<void> {
  if (n <= 0) return;
  await db.projectBrief.updateMany({ where: { id: briefId, searchesUsed: { gte: n } }, data: { searchesUsed: { decrement: n } } });
}

// ─── Steps ──────────────────────────────────────────────────────────────────

/** One step of a brief's stage. `done` when nothing is left for the runner. */
export async function advanceSourceStage(briefId: string, opts: { deadline: number }): Promise<{ done: boolean }> {
  const brief = await db.projectBrief.findUnique({ where: { id: briefId }, select: BRIEF_SELECT });
  if (!brief || !ACTIVE_STAGE_STATUSES.includes(brief.status)) return { done: true };
  if (Date.now() + stepEstimateMs(brief.status, brief.sourceKind, brief.cursor) > opts.deadline) throw new YieldToNextSlice();

  switch (brief.status) {
    case "PENDING":
      await db.projectBrief.updateMany({ where: { id: brief.id, status: "PENDING" }, data: { status: "DRAFTING_OBJECTIVES" } });
      return { done: false };
    case "DRAFTING_OBJECTIVES":
      await stepDraft(brief);
      return { done: false };
    case "PLANNING_POINTS":
      await stepPlan(brief);
      return { done: false };
    case "SEARCHING":
      if (brief.sourceKind === "CASE") await stepCases(brief);
      else if (brief.sourceKind === "ARCHIVE") await stepArchives(brief);
      else await finish(brief, readPoints(brief.points));
      return { done: false };
    default:
      return { done: true };
  }
}

async function stepDraft(brief: StageBrief): Promise<void> {
  const ctx = sourceContext(brief);
  const p = brief.project;
  const savedMode = p.researchMode?.modeNumber;
  if (!isModeNumber(savedMode)) {
    // Never draft objectives before the COO has saved a research mode: the
    // recommendation could still be wrong, and any draft made now would have
    // to be thrown away (see mighty-wondering-hippo plan, 2026-09-29). Park the
    // brief back at PENDING, where the card offers Draft objectives again (the
    // button saves the mode on screen first, so this is only a safety net).
    await db.projectBrief.updateMany({
      where: { id: brief.id, status: "DRAFTING_OBJECTIVES" },
      data: { status: "PENDING", failedSteps: 0, lastError: null, lockedUntil: null },
    });
    return;
  }
  const mode = savedMode;
  const objectivesContext = { title: ctx.topic, department: ctx.department, degree: getDegreeFromDepartment(ctx.department), modeNumber: mode };
  // Pre-check: if the client's own brief or the supervisor's outline already
  // lists the objectives (a run of 4–5 "To …" lines), use them word for word
  // and skip the full draft. Preserves the fromClient flag used by the card.
  // Every report states one aim (founder, 30 Sept 2026): the client's own
  // "Aim: …" line if they wrote one, else one short aim-only call.
  const clientText = { specialInstructions: p.specialInstructions, departmentOutline: p.departmentOutline };
  const stated = extractClientStatedObjectives(clientText);
  const drafted = stated
    ? { objectives: stated, aim: extractClientStatedAim(clientText) ?? (await draftAim(objectivesContext, stated, usage(brief, "draft_aim"))), fromClient: true }
    : await draftObjectives(objectivesContext, usage(brief, "draft_objectives"));
  const next: SourceStageStatus = brief.redraftOnly || !brief.sourceKind ? "READY" : "PLANNING_POINTS";
  // The same write takes the independent check's lease, so the card shows it
  // as running at once; the check then runs in its own invocation.
  const lease = newCheckLease();
  const res = await db.projectBrief.updateMany({
    where: { id: brief.id, status: "DRAFTING_OBJECTIVES" },
    data: {
      draftedObjectives: drafted.objectives,
      objectives: drafted.objectives,
      aim: drafted.aim,
      draftedAim: drafted.aim,
      objectivesFromClient: drafted.fromClient,
      objectivesModeNumber: mode,
      objectivesCheckLockedUntil: lease,
      draftedAt: new Date(),
      redraftOnly: false,
      status: next,
      ...(next === "READY" && !brief.redraftOnly ? { searchedAt: new Date() } : {}),
    },
  });
  if (res.count === 1) await requestObjectivesCheck(brief.id, lease);
  if (res.count === 1 && next === "READY" && !brief.redraftOnly) await announceReady(brief);
}

async function stepPlan(brief: StageBrief): Promise<void> {
  const ctx = sourceContext(brief);
  let points: StoredPoint[] = [];
  if (brief.sourceKind === "CASE") {
    const texts = await planLegalPoints(ctx, usage(brief, "plan_legal_points"));
    points = texts.map((text, index) => ({ index, text, attempts: [], searches: 0, outcome: "PENDING", queries: [] }));
  } else if (brief.sourceKind === "ARCHIVE") {
    const plan = await planArchivePoints(ctx, usage(brief, "plan_archive_points"));
    points = plan.map((p, index) => ({ index, text: p.text, attempts: p.attempts, searches: 0, outcome: "PENDING", queries: [] }));
  }
  if (points.length === 0) {
    await finish(brief, points);
    return;
  }
  await db.projectBrief.updateMany({
    where: { id: brief.id, status: "PLANNING_POINTS" },
    data: { points: asJson(points), cursor: 0, status: "SEARCHING" },
  });
}

// ─── Law: one point at a time ───────────────────────────────────────────────

async function stepCases(brief: StageBrief): Promise<void> {
  const points = readPoints(brief.points);
  const i = Math.floor(brief.cursor / 2);
  const point = points[i];
  if (!point) {
    await finish(brief, points);
    return;
  }
  if (brief.cursor % 2 === 0) await searchPoint(brief, points, point);
  else await confirmPoint(brief, points, point);
}

async function searchPoint(brief: StageBrief, points: StoredPoint[], point: StoredPoint): Promise<void> {
  const reserved = await reserveSearches(brief.id, webSearchesForPoint(brief.searchesUsed));
  if (reserved === 0) {
    // The project's 16 are spent: every point not yet searched keeps its placeholder.
    for (const p of points) if (p.outcome === "PENDING") Object.assign(p, { outcome: "NONE", note: "Not searched: the project's 16 searches were used up." });
    await finish(brief, points);
    return;
  }
  let outcome;
  try {
    outcome = await searchCasesForPoint(sourceContext(brief), point.text, reserved, usage(brief, "search_cases"));
  } catch (error) {
    const spent = error instanceof WebSearchCallError ? (error.uncertain ? reserved : error.searchesUsed) : 0;
    await refundSearches(brief.id, reserved - spent);
    throw error;
  }
  const spent = outcome.incomplete ? reserved : Math.min(reserved, outcome.searchesUsed);
  await refundSearches(brief.id, reserved - spent);
  point.searches += spent;
  point.queries = [...point.queries, ...outcome.queries];
  point.pendingCases = outcome.cases;
  await db.projectBrief.updateMany({
    where: { id: brief.id, status: "SEARCHING", cursor: brief.cursor },
    data: {
      points: asJson(points),
      cursor: brief.cursor + 1,
      searchLog: appendLog(brief.searchLog, [
        {
          at: new Date().toISOString(),
          point: point.index,
          source: "WEB",
          queries: outcome.queries,
          searches: spent,
          results: outcome.resultCount,
          kept: outcome.cases.length,
          ...(outcome.dropped.length ? { dropped: outcome.dropped } : {}),
        },
      ]),
    },
  });
}

async function confirmPoint(brief: StageBrief, points: StoredPoint[], point: StoredPoint): Promise<void> {
  const cases = point.pendingCases ?? [];
  let lookups = brief.officialLookups;
  const found: { c: FoundCase; judgment: CourtJudgment | null }[] = [];
  for (const c of cases) {
    let judgment: CourtJudgment | null = null;
    if (lookups < OFFICIAL_LOOKUP_LIMIT) {
      const conf = await confirmCase(c.caseName, c.year);
      lookups += conf.lookups;
      judgment = conf.judgment;
    }
    found.push({ c, judgment });
  }
  point.outcome = cases.length ? "FOUND" : "NONE";
  if (!cases.length) point.note = "No Nigerian case found after two searches.";
  delete point.pendingCases;
  const last = point.index >= points.length - 1;

  const { moved, created } = await db.$transaction(async (tx) => {
    const res = await tx.projectBrief.updateMany({
      where: { id: brief.id, status: "SEARCHING", cursor: brief.cursor },
      data: {
        points: asJson(points),
        officialLookups: lookups,
        cursor: brief.cursor + 1,
        ...(last ? { status: "READY", searchedAt: new Date() } : {}),
      },
    });
    if (res.count === 0) return { moved: false, created: [] as { id: string; pdfUrl: string | null }[] };
    const rows: { id: string; pdfUrl: string | null }[] = [];
    for (const { c, judgment } of found) {
      const row = await tx.projectSource.create({
        data: {
          projectId: brief.projectId,
          briefId: brief.id,
          kind: "CASE",
          origin: judgment ? "SUPREME_COURT" : "WEB",
          pointIndex: point.index,
          title: c.caseName,
          court: judgment ? "Supreme Court of Nigeria" : c.court,
          decidedOn: judgment?.date ?? (c.year ? String(c.year) : null),
          citation: judgment?.citation ?? c.citation,
          suitNumber: judgment?.suitNumber ?? c.suitNumber,
          sourceUrl: c.sourceUrl,
          officialUrl: judgment?.pdfUrl ?? null,
          relevance: c.supports || null,
          confirmed: Boolean(judgment),
          // Confirmed cases are ticked; the COO judges the others from their source page.
          selected: Boolean(judgment),
        },
        select: { id: true },
      });
      rows.push({ id: row.id, pdfUrl: judgment?.pdfUrl ?? null });
    }
    return { moved: true, created: rows };
  }, { timeout: 20_000, maxWait: 10_000 });
  if (!moved) return; // another run saved this point already

  // The official judgment is copied into the private store; a failed copy keeps the court's own link.
  for (const row of created) {
    if (!row.pdfUrl) continue;
    await storeJudgmentPdf(brief.projectId, row.id, row.pdfUrl).catch((error) =>
      console.error("[source stage] could not store a judgment PDF", row.id, error instanceof Error ? error.message : error),
    );
  }
  if (last) await announceReady(brief);
}

async function storeJudgmentPdf(projectDbId: string, sourceId: string, pdfUrl: string): Promise<void> {
  const bytes = await downloadJudgmentPdf(pdfUrl);
  const pathname = buildPrivatePath({ projectDbId, purpose: "source", targetId: sourceId, random: crypto.randomBytes(12).toString("hex"), ext: "pdf" });
  await putPrivateFile(pathname, bytes, "application/pdf");
  await db.projectSource.updateMany({ where: { id: sourceId, pdfPath: null }, data: { pdfPath: pathname } });
}

// ─── History: one attempt round at a time ───────────────────────────────────

async function stepArchives(brief: StageBrief): Promise<void> {
  const points = readPoints(brief.points);
  const round = Math.floor(brief.cursor / 2);
  if (round >= ATTEMPTS_PER_POINT) {
    await finish(brief, points);
    return;
  }
  if (brief.cursor % 2 === 0) await queryRound(brief, points, round);
  else await judgeRound(brief, points, round);
}

async function queryRound(brief: StageBrief, points: StoredPoint[], round: number): Promise<void> {
  const todo = points.filter((p) => p.outcome === "PENDING" && p.attempts[round]);
  if (todo.length === 0) {
    await finish(brief, points);
    return;
  }
  const log: SearchLogEntry[] = [];
  const planned: { point: StoredPoint; attempt: ArchiveAttempt }[] = [];
  for (const point of todo) {
    if ((await reserveSearches(brief.id, 1)) === 1) planned.push({ point, attempt: point.attempts[round] });
    else point.note = "Not searched again: the project's 16 searches were used up.";
  }
  // Different collections are asked at the same time; one collection is asked at most once a second (sources/http.ts).
  await Promise.all(
    planned.map(async ({ point, attempt }) => {
      let records: ArchiveRecord[] = [];
      let error: string | undefined;
      try {
        records = (await runArchiveQuery(attempt)).slice(0, RECORDS_PER_QUERY);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      point.searches += 1;
      point.queries.push(`${attempt.source}: ${attempt.query}`);
      point.pendingRecords = records;
      log.push({ at: new Date().toISOString(), point: point.index, source: attempt.source, queries: [attempt.query], searches: 1, results: records.length, kept: 0, ...(error ? { error } : {}) });
    }),
  );
  await db.projectBrief.updateMany({
    where: { id: brief.id, status: "SEARCHING", cursor: brief.cursor },
    data: { points: asJson(points), cursor: brief.cursor + 1, searchLog: appendLog(brief.searchLog, log) },
  });
}

async function judgeRound(brief: StageBrief, points: StoredPoint[], round: number): Promise<void> {
  const items: JudgeInput[] = points
    .filter((p) => p.outcome === "PENDING" && p.pendingRecords)
    .map((p) => ({ pointIndex: p.index, point: p.text, records: p.pendingRecords ?? [] }));
  const kept = items.length ? await judgeArchiveResults(sourceContext(brief), items, usage(brief, "judge_archive_records")) : [];

  for (const p of points) {
    if (p.outcome !== "PENDING") continue;
    const judged = items.some((i) => i.pointIndex === p.index);
    delete p.pendingRecords;
    if (kept.some((k) => k.pointIndex === p.index)) p.outcome = "FOUND";
    else if (!judged || round + 1 >= ATTEMPTS_PER_POINT || !p.attempts[round + 1]) {
      p.outcome = "NONE";
      p.note = p.note ?? "Nothing usable after two searches.";
    }
  }
  const done = round + 1 >= ATTEMPTS_PER_POINT || !points.some((p) => p.outcome === "PENDING");

  const moved = await db.$transaction(async (tx) => {
    const res = await tx.projectBrief.updateMany({
      where: { id: brief.id, status: "SEARCHING", cursor: brief.cursor },
      data: {
        points: asJson(points),
        cursor: brief.cursor + 1,
        ...(done ? { status: "READY", searchedAt: new Date() } : {}),
      },
    });
    if (res.count === 0) return false;
    for (const k of kept) {
      await tx.projectSource.create({
        data: {
          projectId: brief.projectId,
          briefId: brief.id,
          kind: "ARCHIVE",
          origin: k.record.source as SourceOrigin,
          pointIndex: k.pointIndex,
          title: k.record.title,
          decidedOn: k.record.date,
          holder: k.record.holder,
          reference: k.record.reference,
          recordType: k.record.recordType,
          sourceUrl: k.record.url,
          officialUrl: k.record.url,
          relevance: k.relevance || null,
          selected: true,
        },
      });
    }
    return true;
  }, { timeout: 20_000, maxWait: 10_000 });
  if (moved && done) await announceReady(brief);
}

// ─── Finishing ──────────────────────────────────────────────────────────────

async function finish(brief: StageBrief, points: StoredPoint[]): Promise<void> {
  for (const p of points) {
    if (p.outcome === "PENDING") p.outcome = "NONE";
    delete p.pendingCases;
    delete p.pendingRecords;
  }
  const res = await db.projectBrief.updateMany({
    where: { id: brief.id, status: brief.status, cursor: brief.cursor },
    data: { points: asJson(points), status: "READY", searchedAt: new Date() },
  });
  if (res.count === 1) await announceReady(brief);
}

async function announceReady(brief: StageBrief): Promise<void> {
  const what = brief.sourceKind === "CASE" ? "Objectives and cases" : brief.sourceKind === "ARCHIVE" ? "Objectives and archival sources" : "Objectives";
  await notifyOperations({
    title: "Ready for your approval",
    message: `${brief.project.projectId}: ${what} are ready to review on the Report tab.`,
    type: "info",
    link: `/admin/projects/${brief.project.projectId}?tab=report`,
  }).catch(() => {});
}

/** A step that retrying cannot fix: the stage stops as FAILED, keeping everything found so far. */
export async function failSourceStage(briefId: string, message: string): Promise<boolean> {
  const res = await db.projectBrief.updateMany({
    where: { id: briefId, status: { in: ACTIVE_STAGE_STATUSES } },
    data: { status: "FAILED", lastError: message, lockedUntil: null },
  });
  return res.count === 1;
}

/** Where a stopped or failed stage carries on from, read from what it has already saved. */
export function resumeStatusFor(b: { objectives: string[]; sourceKind: string | null; points: Prisma.JsonValue | null; searchedAt: Date | null }): SourceStageStatus {
  if (b.objectives.length === 0) return "DRAFTING_OBJECTIVES";
  if (!b.sourceKind || b.searchedAt) return "READY";
  if (!Array.isArray(b.points)) return "PLANNING_POINTS";
  return "SEARCHING";
}
