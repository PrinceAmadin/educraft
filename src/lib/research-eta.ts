/**
 * Time estimate for a running research job. Pure — no I/O — so the worker's
 * browser can recompute it on every poll.
 *
 * The job is a fixed sequence of phases, and each phase does a countable
 * amount of work per step (searches run 3 at a time, PDF checks 8, relevance
 * checks 20, Drive uploads 3). So remaining time = remaining steps × how long
 * a step of that phase takes, using durations measured on full live runs.
 * (`observed` lets a caller override them with measured values.)
 */

export type PhaseKey = "search" | "pdfs" | "relevance" | "drive";

export const PHASES: { key: PhaseKey; label: string }[] = [
  { key: "search", label: "Searching academic databases" },
  { key: "pdfs", label: "Checking which papers have free PDFs" },
  { key: "relevance", label: "Checking relevance to the topic" },
  { key: "drive", label: "Saving PDFs and the reference list to Drive" },
];

/**
 * Seconds per step, from a full run on the production deployment (100 papers,
 * 30 steps, 255s; the first round now fetches 150). Steps run back-to-back inside one invocation there, so
 * they're much faster than on a laptop.
 */
export const DEFAULT_STEP_SECONDS: Record<PhaseKey, number> = {
  search: 6,
  pdfs: 5,
  relevance: 20,
  drive: 8,
};

const CANDIDATES_PER_ROUND = 150;
const SEARCH_BATCH = 36; // ~3 queries per step, ~12 papers kept from each
const RESOLVE_BATCH = 8;
const CLASSIFY_BATCH = 20;
const DRIVE_BATCH = 3;
/** On the measured run, ~45% of papers passed relevance and ~22% of those had a downloadable PDF. */
const EXPECTED_KEEP_RATE = 0.45;
const EXPECTED_PDF_RATE = 0.22;

export function phaseForStatus(status: string): PhaseKey | null {
  switch (status) {
    case "FINDING_CANDIDATES":
    case "REPLACING":
      return "search";
    case "VERIFYING_DOIS":
    case "RESOLVING_PDFS":
    case "IMPORTING_ZOTERO":
      return "pdfs";
    case "CLASSIFYING":
      return "relevance";
    case "UPLOADING_DRIVE":
      return "drive";
    default:
      return null;
  }
}

export interface EtaJob {
  status: string;
  replacementRound: number;
  searchQueries: string[];
  searchCursor: number;
  references: { status: string; round: number; doi: string | null; access: string | null; classification: string | null; driveFileId: string | null }[];
}

export interface Eta {
  remainingSeconds: number;
  /** Estimated length of the whole job from a standing start, for the progress bar. */
  totalSeconds: number;
  phase: PhaseKey;
  /** 1-based, of PHASES.length. */
  phaseNumber: number;
}

const steps = (n: number, batch: number) => Math.ceil(Math.max(n, 0) / batch);

function remainingSeconds(job: EtaJob, phase: PhaseKey, sec: Record<PhaseKey, number>): number {
  const refs = job.references;
  const inRound = refs.filter((r) => r.round === job.replacementRound).length;
  const roundTarget = job.replacementRound === 0 ? CANDIDATES_PER_ROUND : 40;

  // Papers still to be found this round (only non-zero while searching).
  const toFind = phase === "search" ? Math.max(roundTarget - inRound, 0) : 0;
  // Papers that still need their PDF check, now or once found.
  const toResolve = refs.filter((r) => r.doi && r.access === null).length + toFind;
  const searchSteps =
    phase === "search" ? steps(toFind, SEARCH_BATCH) + (job.searchQueries.length === 0 ? 1 : 0) : 0;

  const resolveSteps = phase === "search" || phase === "pdfs" ? steps(toResolve, RESOLVE_BATCH) + 1 : 0;

  const unclassified = refs.filter((r) => r.status === "IMPORTED" && r.classification === null).length;
  const toClassify = phase === "relevance" ? unclassified : unclassified + toResolve;
  const classifySteps = phase === "drive" ? 0 : steps(toClassify, CLASSIFY_BATCH) + 1;

  const keptPdfsPending =
    phase === "drive"
      ? refs.filter((r) => r.status === "KEPT" && r.access === "OPEN_ACCESS" && r.driveFileId === null).length
      : Math.round((refs.length + toFind) * EXPECTED_KEEP_RATE * EXPECTED_PDF_RATE);
  const driveSteps = steps(keptPdfsPending, DRIVE_BATCH) + 1;

  return (
    searchSteps * sec.search + resolveSteps * sec.pdfs + classifySteps * sec.relevance + driveSteps * sec.drive
  );
}

export function estimateEta(
  job: EtaJob,
  observed: Partial<Record<PhaseKey, number>> = {}
): Eta | null {
  const phase = phaseForStatus(job.status);
  if (!phase) return null;
  const sec = { ...DEFAULT_STEP_SECONDS, ...observed };

  const fresh: EtaJob = { status: "FINDING_CANDIDATES", replacementRound: 0, searchQueries: [], searchCursor: 0, references: [] };
  return {
    remainingSeconds: remainingSeconds(job, phase, sec),
    totalSeconds: remainingSeconds(fresh, "search", sec),
    phase,
    phaseNumber: PHASES.findIndex((p) => p.key === phase) + 1,
  };
}

/** "about 6 min", "about 1 min 30 s", "under a minute" — rounded so it doesn't flicker every step. */
export function formatEta(seconds: number): string {
  if (seconds < 45) return "under a minute";
  const rounded = Math.round(seconds / 30) * 30;
  const min = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (min === 0) return "about 1 min";
  return rest === 0 ? `about ${min} min` : `about ${min} min ${rest} s`;
}
