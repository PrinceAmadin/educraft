/**
 * What the COO's card shows of a project's brief (D3b): the objectives, the
 * points searched, the sources found under each, the searches spent and what
 * can be done next. Pure: built from rows already read, so the card, the API
 * and check:sources all agree.
 */

import type { Prisma, SourceKind, SourceOrigin, SourceStageStatus } from "@prisma/client";
import { validateObjectives } from "@/lib/generation/objectives-rules";
import { ARCHIVE_SOURCES, SOURCE_SEARCH_LIMIT, domainOf, placeholderFor, sourceKindForDepartment } from "@/lib/research/source-policy";
import { readPoints } from "@/lib/research/source-points";

/** Matches source-stage-runner.ts (kept here so this file stays free of the runner's imports). */
const MAX_STAGE_FAILURES = 4;
/** The statuses a background run works through. PENDING is not one: it waits for the founder's or the COO's click. */
const RUNNING: SourceStageStatus[] = ["DRAFTING_OBJECTIVES", "PLANNING_POINTS", "SEARCHING"];
/**
 * A run whose lease has lapsed and that has not been written for this long has
 * lost its background chain (a live slice renews its lease every 20 s, and a
 * hand-over between slices takes seconds). Nothing restarts it on its own: the
 * card shows it as stopped and offers Carry on.
 */
export const STAGE_QUIET_MS = 180_000;

/** True when a run has gone quiet (see STAGE_QUIET_MS). Shared by the card and carryOnSourceStage. */
export function isQuietRun(b: { status: SourceStageStatus; lockedUntil: Date | null; updatedAt: Date }, now = Date.now()): boolean {
  if (!RUNNING.includes(b.status)) return false;
  if (b.lockedUntil && b.lockedUntil.getTime() > now) return false;
  return now - b.updatedAt.getTime() >= STAGE_QUIET_MS;
}

export const BRIEF_CARD_SELECT = {
  id: true,
  status: true,
  sourceKind: true,
  department: true,
  draftedObjectives: true,
  objectives: true,
  objectivesFromClient: true,
  objectivesModeNumber: true,
  points: true,
  searchesUsed: true,
  cursor: true,
  lockedUntil: true,
  failedSteps: true,
  lastError: true,
  searchedAt: true,
  updatedAt: true,
  sources: {
    orderBy: [{ pointIndex: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      kind: true,
      origin: true,
      pointIndex: true,
      title: true,
      court: true,
      decidedOn: true,
      citation: true,
      suitNumber: true,
      holder: true,
      reference: true,
      recordType: true,
      sourceUrl: true,
      officialUrl: true,
      relevance: true,
      confirmed: true,
      selected: true,
      pdfPath: true,
      addedById: true,
    },
  },
} satisfies Prisma.ProjectBriefSelect;

export type BriefCardRow = Prisma.ProjectBriefGetPayload<{ select: typeof BRIEF_CARD_SELECT }>;

export interface BriefSourceView {
  id: string;
  kind: SourceKind;
  pointIndex: number;
  origin: SourceOrigin;
  originLabel: string;
  title: string;
  court: string | null;
  decidedOn: string | null;
  citation: string | null;
  suitNumber: string | null;
  holder: string | null;
  reference: string | null;
  recordType: string | null;
  sourceUrl: string | null;
  sourceDomain: string | null;
  officialUrl: string | null;
  relevance: string | null;
  confirmed: boolean;
  selected: boolean;
  hasPdf: boolean;
  addedByCoo: boolean;
}

export interface BriefPointView {
  index: number;
  text: string;
  outcome: "PENDING" | "FOUND" | "NONE";
  note: string | null;
  searches: number;
  sources: BriefSourceView[];
}

export interface BriefView {
  /** NONE: no brief yet. PENDING: made before the manual start (e.g. EC-00010), also not started. */
  status: SourceStageStatus | "NONE";
  /** Nothing drafted or searched yet: the card offers Draft objectives. */
  notStarted: boolean;
  running: boolean;
  /** Stopped after repeated failures, FAILED, or gone quiet: "Carry on" resumes. */
  stopped: boolean;
  error: string | null;
  sourceKind: SourceKind | null;
  kindLabel: string | null;
  placeholder: string | null;
  /** The department on the card now calls for a different search than the one run. */
  kindMismatch: { now: SourceKind | null } | null;
  /** The search finished without any point to look for: the COO can run it again. */
  noPoints: boolean;
  objectives: string[];
  draftedObjectives: string[];
  objectivesFromClient: boolean;
  /** The mode the objectives were drafted for (null: drafted before modes were recorded). */
  objectivesMode: number | null;
  /** The objectives were drafted for another mode than the one on the card: Draft again. */
  modeMismatch: { drafted: number | null; now: number } | null;
  objectivesProblems: string[];
  points: BriefPointView[];
  searchesUsed: number;
  searchLimit: number;
  costNaira: number;
  progress: string | null;
  attribution: string | null;
  canStart: boolean;
  canRedraft: boolean;
  canCarryOn: boolean;
  canEdit: boolean;
}

const ORIGIN_LABEL: Record<SourceOrigin, string> = {
  WEB: "Open web",
  SUPREME_COURT: "Supreme Court record",
  HANSARD: ARCHIVE_SOURCES.HANSARD.label,
  NATIONAL_ARCHIVES: ARCHIVE_SOURCES.NATIONAL_ARCHIVES.label,
  INTERNET_ARCHIVE: ARCHIVE_SOURCES.INTERNET_ARCHIVE.label,
  WELLCOME: ARCHIVE_SOURCES.WELLCOME.label,
  UNILAG: ARCHIVE_SOURCES.UNILAG.label,
  ABU: ARCHIVE_SOURCES.ABU.label,
  NATIONAL_LIBRARY: ARCHIVE_SOURCES.NATIONAL_LIBRARY.label,
  IBADAN: ARCHIVE_SOURCES.IBADAN.label,
  COO: "Added by the COO",
};

export function kindLabel(kind: SourceKind | null): string | null {
  return kind === "CASE" ? "Cases" : kind === "ARCHIVE" ? "Archival sources" : null;
}

function progressLine(b: BriefCardRow, pointCount: number): string | null {
  switch (b.status) {
    case "PENDING":
      return "Starting…";
    case "DRAFTING_OBJECTIVES":
      return "Drafting objectives…";
    case "PLANNING_POINTS":
      return b.sourceKind === "CASE" ? "Working out the legal points to search…" : "Working out the questions to search…";
    case "SEARCHING": {
      if (b.sourceKind === "CASE") {
        const n = Math.min(pointCount, Math.floor(b.cursor / 2) + 1);
        return `Finding cases: point ${n} of ${pointCount}`;
      }
      return `Searching the archives: round ${Math.floor(b.cursor / 2) + 1} of 2`;
    }
    default:
      return null;
  }
}

/** The sentence for objectives drafted for another mode (the card and the approval refusal share it). */
export function modeMismatchLine(m: { drafted: number | null; now: number }): string {
  return m.drafted
    ? `The objectives were drafted for Mode ${m.drafted}. Press Draft again to draft them for Mode ${m.now}.`
    : `The objectives were drafted before the mode was recorded. Press Draft again to draft them for Mode ${m.now}.`;
}

/** Objectives drafted for another mode than `currentMode`, on a finished brief (null when they match or nothing is drafted). */
export function objectivesModeMismatch(
  b: { status: SourceStageStatus | "NONE"; objectivesMode: number | null },
  currentMode: number | null,
): { drafted: number | null; now: number } | null {
  if (b.status !== "READY" || !currentMode || b.objectivesMode === currentMode) return null;
  return { drafted: b.objectivesMode, now: currentMode };
}

export function buildBriefView(
  b: BriefCardRow | null,
  opts: { costNaira: number; currentDepartment: string | null; currentMode: number | null; locked: boolean; now?: number },
): BriefView {
  const now = opts.now ?? Date.now();
  const expected = sourceKindForDepartment(opts.currentDepartment);
  if (!b || b.status === "PENDING") {
    return {
      status: b ? "PENDING" : "NONE",
      notStarted: true,
      running: false,
      stopped: false,
      error: null,
      sourceKind: expected,
      kindLabel: kindLabel(expected),
      placeholder: expected ? placeholderFor(expected) : null,
      kindMismatch: null,
      noPoints: false,
      objectives: [],
      draftedObjectives: [],
      objectivesFromClient: false,
      objectivesMode: null,
      modeMismatch: null,
      objectivesProblems: [],
      points: [],
      searchesUsed: b?.searchesUsed ?? 0,
      searchLimit: SOURCE_SEARCH_LIMIT,
      costNaira: opts.costNaira,
      progress: null,
      attribution: null,
      canStart: !opts.locked,
      canRedraft: false,
      canCarryOn: false,
      canEdit: false,
    };
  }
  const active = RUNNING.includes(b.status);
  const quiet = isQuietRun(b, now);
  const stopped = b.status === "FAILED" || (active && b.failedSteps >= MAX_STAGE_FAILURES) || quiet;
  const leaseLive = Boolean(b.lockedUntil && b.lockedUntil.getTime() > now);
  const running = active && !stopped;
  const points = readPoints(b.points);
  const sources: BriefSourceView[] = b.sources.map((s) => ({
    id: s.id,
    kind: s.kind,
    pointIndex: s.pointIndex,
    origin: s.origin,
    originLabel: ORIGIN_LABEL[s.origin],
    title: s.title,
    court: s.court,
    decidedOn: s.decidedOn,
    citation: s.citation,
    suitNumber: s.suitNumber,
    holder: s.holder,
    reference: s.reference,
    recordType: s.recordType,
    sourceUrl: s.sourceUrl,
    sourceDomain: domainOf(s.sourceUrl),
    officialUrl: s.officialUrl,
    relevance: s.relevance,
    confirmed: s.confirmed,
    selected: s.selected,
    hasPdf: Boolean(s.pdfPath),
    addedByCoo: Boolean(s.addedById),
  }));
  const pointViews: BriefPointView[] = points.map((p) => ({
    index: p.index,
    text: p.text,
    outcome: p.outcome,
    note: p.note ?? null,
    searches: p.searches,
    sources: sources.filter((s) => s.pointIndex === p.index),
  }));
  const ready = b.status === "READY";
  const check = validateObjectives(b.objectives);
  const mismatch = ready && b.sourceKind !== expected ? { now: expected } : null;
  const noPoints = ready && !mismatch && Boolean(b.sourceKind) && points.length === 0;
  const hasHansard = sources.some((s) => s.origin === "HANSARD");
  const modeMismatch = opts.locked ? null : objectivesModeMismatch({ status: b.status, objectivesMode: b.objectivesModeNumber }, opts.currentMode);
  const error = quiet && !b.lastError ? "The background run was interrupted." : stopped || (!leaseLive && b.lastError) ? b.lastError : null;

  return {
    status: b.status,
    notStarted: false,
    running,
    stopped,
    error,
    sourceKind: b.sourceKind,
    kindLabel: kindLabel(b.sourceKind),
    placeholder: b.sourceKind ? placeholderFor(b.sourceKind) : null,
    kindMismatch: mismatch,
    noPoints,
    objectives: b.objectives,
    draftedObjectives: b.draftedObjectives,
    objectivesFromClient: b.objectivesFromClient,
    objectivesMode: b.objectivesModeNumber,
    modeMismatch,
    objectivesProblems: ready && !check.ok ? check.problems : [],
    points: pointViews,
    searchesUsed: b.searchesUsed,
    searchLimit: SOURCE_SEARCH_LIMIT,
    costNaira: opts.costNaira,
    progress: running ? progressLine(b, points.length) : null,
    attribution: hasHansard ? "Contains Parliamentary information licensed under the Open Parliament Licence v3.0." : null,
    canStart: !opts.locked && (mismatch !== null || noPoints),
    canRedraft: !opts.locked && ready,
    canCarryOn: !opts.locked && stopped,
    canEdit: !opts.locked && ready,
  };
}

/** For the card's blockers: why the brief stops approval now (empty when it does not). */
export function briefBlockers(view: BriefView, reportProject: boolean): string[] {
  if (!reportProject) return [];
  if (view.notStarted) return ["Draft the objectives first: press Draft objectives below."];
  if (view.stopped) return [`The objectives and source search stopped${view.error ? `: ${view.error.replace(/\.+$/, "")}` : ""}. Press Carry on.`];
  if (view.running) return ["The objectives and sources are still being prepared."];
  if (view.kindMismatch) {
    const now = view.kindMismatch.now;
    return [
      now
        ? `The department now calls for ${now === "CASE" ? "cases" : "archival sources"}: press Start again to search for them.`
        : "The department no longer needs a source search: press Start again to clear it.",
    ];
  }
  if (view.modeMismatch) return [modeMismatchLine(view.modeMismatch)];
  return view.objectivesProblems;
}
