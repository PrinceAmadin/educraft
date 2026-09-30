/**
 * The public supervisor page and its downloads live behind a shareToken on
 * ResearchJob. No login: the unguessable token IS the credential (32 hex
 * chars, 128 bits of entropy). This file is what the routes call — it never
 * talks about the pipeline internals, and it never returns internal
 * terminology (CORE / CLOSELY_RELATED) to the caller.
 */
import { db } from "@/lib/db";
import { hasPdf } from "@/lib/services/research-files";
import { notifyOperations } from "@/lib/services/notifications";
import { formattedReferences, type ReferencingStyle } from "@/lib/research-references-doc";
import type { SupervisorGrouping } from "@/lib/services/research";

/** Token shape: 32 hex characters (crypto.randomBytes(16).toString("hex")). */
const TOKEN_RE = /^[a-f0-9]{32}$/;

export function isShareToken(value: string): boolean {
  return TOKEN_RE.test(value);
}

/** Friendly grouping the supervisor page reads — no internal strings ever escape. */
export interface SupervisorReference {
  id: string;
  title: string;
  authors: string | null;
  year: number | null;
  journal: string | null;
  citations: number | null;
  doi: string | null;
  /** Abstract shown behind an inline "Show abstract" toggle. Null when OpenAlex had none. */
  abstract: string | null;
  /** True when we have a downloadable PDF stored on our side. */
  hasPdf: boolean;
  /** "key" for CORE, "supporting" for CLOSELY_RELATED. Nothing else is kept. */
  tier: "key" | "supporting";
  /** Plain-text formatted citation in the project's referencing style, ready to copy. */
  formattedCitation: string;
}

export interface SupervisorCitationSummary {
  /** Total citations across every kept reference. */
  totalCitations: number;
  /** Median publication year of the kept set. */
  medianYear: number | null;
  /** The most-cited paper in the set. */
  topCited: { title: string; authors: string | null; year: number | null; citations: number } | null;
  /** Downloadable open-access count (= totals.withPdf, duplicated for convenience). */
  downloadable: number;
}

/** One subproblem section for the supervisor page, in the analysis's own order. */
export interface SupervisorGroup {
  subproblem: string;
  references: SupervisorReference[];
}

export interface SupervisorPackage {
  projectCode: string;
  projectTitle: string | null;
  universityName: string | null;
  department: string | null;
  supervisorName: string | null;
  preparedAt: string;
  /** How many rounds the pipeline ran through (round 0 = first pass; each replacement round adds one). */
  candidateRounds: number;
  totals: {
    total: number;
    key: number;
    supporting: number;
    withPdf: number;
    paywalled: number;
  };
  citationSummary: SupervisorCitationSummary;
  /**
   * Subproblem grouping when the job has one (`groups` = one section per
   * subproblem the project analysis named; `unassigned` = general foundations).
   * Null on jobs without a stored `supervisorGrouping` — the page then falls
   * back to `key` / `supporting`.
   */
  bySubproblem: { groups: SupervisorGroup[]; unassigned: SupervisorReference[] } | null;
  /** Fallback tier grouping (always populated). */
  key: { withPdf: SupervisorReference[]; paywalled: SupervisorReference[] };
  supporting: { withPdf: SupervisorReference[]; paywalled: SupervisorReference[] };
  /** For access counters shown on the internal side. */
  supervisorViews: number;
  supervisorFirstViewedAt: string | null;
  supervisorLastViewedAt: string | null;
  supervisorPdfDownloads: number;
}

interface JobLookup {
  id: string;
  projectId: string;
  projectCode: string;
  supervisorFirstViewedAt: Date | null;
}

function readGrouping(raw: unknown): SupervisorGrouping | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const g = raw as Record<string, unknown>;
  const groups = Array.isArray(g.groups) ? g.groups : [];
  const unassigned = Array.isArray(g.unassigned) ? g.unassigned.filter((x): x is string => typeof x === "string") : [];
  const clean = groups
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      if (typeof r.subproblemIndex !== "number") return null;
      const referenceIds = Array.isArray(r.referenceIds) ? r.referenceIds.filter((x): x is string => typeof x === "string") : [];
      return { subproblemIndex: r.subproblemIndex, referenceIds };
    })
    .filter((row): row is { subproblemIndex: number; referenceIds: string[] } => row !== null);
  return { groups: clean, unassigned };
}

function readSubproblems(raw: unknown): string[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const a = raw as Record<string, unknown>;
  return Array.isArray(a.subproblems) ? a.subproblems.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}

/** As-plain-text — drops italic hints from Word segments; supervisors reading a copied line don't need them. */
function citationFromSegments(segs: { text: string }[]): string {
  return segs
    .map((s) => s.text)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function computeCitationSummary(refs: SupervisorReference[]): SupervisorCitationSummary {
  const withYears = refs.map((r) => r.year).filter((y): y is number => typeof y === "number");
  const sortedYears = [...withYears].sort((a, b) => a - b);
  const medianYear = sortedYears.length > 0
    ? sortedYears[Math.floor(sortedYears.length / 2)]
    : null;
  const totalCitations = refs.reduce((a, r) => a + (r.citations ?? 0), 0);
  const top = refs.reduce<SupervisorReference | null>((best, r) => {
    if (!r.citations) return best;
    if (!best || (r.citations > (best.citations ?? 0))) return r;
    return best;
  }, null);
  const topCited = top
    ? { title: top.title, authors: top.authors, year: top.year, citations: top.citations ?? 0 }
    : null;
  return {
    totalCitations,
    medianYear,
    topCited,
    downloadable: refs.filter((r) => r.hasPdf).length,
  };
}

/** Loads by token or returns null. Never returns anything unless status = PASSED. */
export async function loadSupervisorPackage(token: string): Promise<SupervisorPackage | null> {
  if (!isShareToken(token)) return null;
  const job = await db.researchJob.findUnique({
    where: { shareToken: token },
    select: {
      id: true,
      status: true,
      createdAt: true,
      replacementRound: true,
      projectAnalysis: true,
      supervisorGrouping: true,
      supervisorViews: true,
      supervisorFirstViewedAt: true,
      supervisorLastViewedAt: true,
      supervisorPdfDownloads: true,
      project: {
        select: {
          projectId: true,
          projectTitle: true,
          supervisorName: true,
          referencingStyle: true,
          client: { select: { department: true, university: { select: { name: true } } } },
        },
      },
      references: {
        where: { status: "KEPT" },
        select: {
          id: true,
          title: true,
          proposedTitle: true,
          authors: true,
          year: true,
          journal: true,
          doi: true,
          abstract: true,
          citedByCount: true,
          classification: true,
          pdfBlobPath: true,
          driveFileId: true,
        },
      },
    },
  });
  if (!job || job.status !== "PASSED") return null;

  // Formatted citations follow the project's own referencing style; the helper
  // returns the same ordering (and the same de-duplication) as the .docx.
  const style = job.project.referencingStyle ?? null;
  const citationById = new Map(
    formattedReferences(job.references, style).map(({ ref, segs }) => [ref.id, citationFromSegments(segs)]),
  );

  const refs: SupervisorReference[] = job.references
    .map((r) => ({
      id: r.id,
      title: (r.title ?? r.proposedTitle).trim(),
      authors: r.authors,
      year: r.year,
      journal: r.journal,
      citations: r.citedByCount,
      doi: r.doi,
      abstract: r.abstract && r.abstract.trim().length > 0 ? r.abstract.trim() : null,
      hasPdf: hasPdf(r),
      tier: r.classification === "CORE" ? ("key" as const) : ("supporting" as const),
      formattedCitation: citationById.get(r.id) ?? "",
    }))
    // A stable, supervisor-friendly order: most-cited first inside each bucket.
    .sort((a, b) => (b.citations ?? 0) - (a.citations ?? 0) || a.title.localeCompare(b.title));

  const byId = new Map(refs.map((r) => [r.id, r]));
  const bucket = (tier: "key" | "supporting", withPdf: boolean) =>
    refs.filter((r) => r.tier === tier && r.hasPdf === withPdf);

  const key = { withPdf: bucket("key", true), paywalled: bucket("key", false) };
  const supporting = { withPdf: bucket("supporting", true), paywalled: bucket("supporting", false) };

  // Subproblem grouping is a polish layer: null on old jobs and grouping
  // failures alike, in which case the page falls back to the tier grouping.
  const grouping = readGrouping(job.supervisorGrouping);
  const subproblems = readSubproblems(job.projectAnalysis);
  let bySubproblem: SupervisorPackage["bySubproblem"] = null;
  if (grouping && subproblems.length > 0) {
    // Preserve the analysis's own order of subproblems; each group carries
    // its refs in the same most-cited-first order as the tier buckets.
    const orderedGroups: SupervisorGroup[] = [];
    for (let idx = 0; idx < subproblems.length; idx++) {
      const row = grouping.groups.find((g) => g.subproblemIndex === idx);
      if (!row) continue;
      const groupRefs = row.referenceIds
        .map((id) => byId.get(id))
        .filter((r): r is SupervisorReference => Boolean(r))
        .sort((a, b) => (b.citations ?? 0) - (a.citations ?? 0) || a.title.localeCompare(b.title));
      if (groupRefs.length > 0) {
        orderedGroups.push({ subproblem: subproblems[idx], references: groupRefs });
      }
    }
    const unassignedRefs = grouping.unassigned
      .map((id) => byId.get(id))
      .filter((r): r is SupervisorReference => Boolean(r))
      .sort((a, b) => (b.citations ?? 0) - (a.citations ?? 0) || a.title.localeCompare(b.title));
    bySubproblem = { groups: orderedGroups, unassigned: unassignedRefs };
  }

  return {
    projectCode: job.project.projectId,
    projectTitle: job.project.projectTitle,
    universityName: job.project.client.university?.name ?? null,
    department: job.project.client.department ?? null,
    supervisorName: job.project.supervisorName ?? null,
    preparedAt: job.createdAt.toISOString(),
    // Round 0 is the first pass; each replacement round adds one. We use this
    // in the "how this list was built" note as a proxy for candidate volume.
    candidateRounds: job.replacementRound + 1,
    totals: {
      total: refs.length,
      key: key.withPdf.length + key.paywalled.length,
      supporting: supporting.withPdf.length + supporting.paywalled.length,
      withPdf: refs.filter((r) => r.hasPdf).length,
      paywalled: refs.filter((r) => !r.hasPdf).length,
    },
    citationSummary: computeCitationSummary(refs),
    bySubproblem,
    key,
    supporting,
    supervisorViews: job.supervisorViews,
    supervisorFirstViewedAt: job.supervisorFirstViewedAt?.toISOString() ?? null,
    supervisorLastViewedAt: job.supervisorLastViewedAt?.toISOString() ?? null,
    supervisorPdfDownloads: job.supervisorPdfDownloads,
  };
}

/** Look up the reference + its stored PDF path for the public PDF download. Never returns paywalled. */
export async function loadSupervisorReference(
  token: string,
  referenceId: string,
): Promise<{ jobId: string; projectCode: string; ref: { id: string; title: string | null; proposedTitle: string; authors: string | null; year: number | null; pdfBlobPath: string | null; driveFileId: string | null } } | null> {
  if (!isShareToken(token)) return null;
  const job = await db.researchJob.findUnique({
    where: { shareToken: token },
    select: { id: true, status: true, project: { select: { projectId: true } } },
  });
  if (!job || job.status !== "PASSED") return null;
  const ref = await db.reference.findFirst({
    where: { id: referenceId, researchJobId: job.id, status: "KEPT" },
    select: { id: true, title: true, proposedTitle: true, authors: true, year: true, pdfBlobPath: true, driveFileId: true },
  });
  if (!ref || !hasPdf(ref)) return null;
  return { jobId: job.id, projectCode: job.project.projectId, ref };
}

/** Load the whole KEPT set for the .docx exports. Same shape the worker's downloads use. */
export async function loadSupervisorReferencesForDoc(token: string): Promise<{ projectCode: string; referencingStyle: ReferencingStyle | null; references: { title: string | null; proposedTitle: string; authors: string | null; year: number | null; journal: string | null; doi: string | null; pdfBlobPath: string | null; driveFileId: string | null }[] } | null> {
  if (!isShareToken(token)) return null;
  const job = await db.researchJob.findUnique({
    where: { shareToken: token },
    select: {
      id: true,
      status: true,
      project: { select: { projectId: true, referencingStyle: true } },
      references: {
        where: { status: "KEPT" },
        select: { title: true, proposedTitle: true, authors: true, year: true, journal: true, doi: true, pdfBlobPath: true, driveFileId: true },
      },
    },
  });
  if (!job || job.status !== "PASSED") return null;
  return {
    projectCode: job.project.projectId,
    referencingStyle: job.project.referencingStyle,
    references: job.references,
  };
}

/**
 * Bumps the view counter and — the FIRST time only — notifies operations
 * that the supervisor opened the package. Runs in `waitUntil`, never blocks
 * the page render. Silent on subsequent views; the counter carries the rest.
 */
export async function recordSupervisorView(token: string): Promise<void> {
  if (!isShareToken(token)) return;
  // Compare-and-set the first-view flag atomically so a race between two
  // simultaneous opens still fires notifyOperations exactly once.
  const claimed = await db.researchJob.updateMany({
    where: { shareToken: token, status: "PASSED", supervisorFirstViewedAt: null },
    data: { supervisorFirstViewedAt: new Date() },
  });
  await db.researchJob.updateMany({
    where: { shareToken: token, status: "PASSED" },
    data: { supervisorViews: { increment: 1 }, supervisorLastViewedAt: new Date() },
  });
  if (claimed.count === 1) {
    const info = await db.researchJob.findUnique({
      where: { shareToken: token },
      select: { project: { select: { projectId: true } } },
    });
    const code = info?.project.projectId ?? "the reference package";
    await notifyOperations({
      title: "Supervisor opened the reference package",
      message: `${code}: a supervisor just opened the shared reference page.`,
      type: "info",
    }).catch((error) => console.error("[supervisor package] notifyOperations failed", error));
  }
}

/** Bumps the PDF-download counter. `waitUntil` inside the route. */
export async function recordSupervisorPdfDownload(token: string): Promise<void> {
  if (!isShareToken(token)) return;
  await db.researchJob.updateMany({
    where: { shareToken: token, status: "PASSED" },
    data: { supervisorPdfDownloads: { increment: 1 } },
  });
}
