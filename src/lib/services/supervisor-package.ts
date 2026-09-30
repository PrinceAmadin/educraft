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
import type { ReferencingStyle } from "@/lib/research-references-doc";

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
  /** True when we have a downloadable PDF stored on our side. */
  hasPdf: boolean;
  /** "key" for CORE, "supporting" for CLOSELY_RELATED. Nothing else is kept. */
  tier: "key" | "supporting";
}

export interface SupervisorPackage {
  projectCode: string;
  projectTitle: string | null;
  universityName: string | null;
  department: string | null;
  supervisorName: string | null;
  preparedAt: string;
  totals: {
    total: number;
    key: number;
    supporting: number;
    withPdf: number;
    paywalled: number;
  };
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

/** Loads by token or returns null. Never returns anything unless status = PASSED. */
export async function loadSupervisorPackage(token: string): Promise<SupervisorPackage | null> {
  if (!isShareToken(token)) return null;
  const job = await db.researchJob.findUnique({
    where: { shareToken: token },
    select: {
      id: true,
      status: true,
      createdAt: true,
      supervisorViews: true,
      supervisorFirstViewedAt: true,
      supervisorLastViewedAt: true,
      supervisorPdfDownloads: true,
      project: {
        select: {
          projectId: true,
          projectTitle: true,
          supervisorName: true,
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
          citedByCount: true,
          classification: true,
          pdfBlobPath: true,
          driveFileId: true,
        },
      },
    },
  });
  if (!job || job.status !== "PASSED") return null;

  const refs: SupervisorReference[] = job.references
    .map((r) => ({
      id: r.id,
      title: (r.title ?? r.proposedTitle).trim(),
      authors: r.authors,
      year: r.year,
      journal: r.journal,
      citations: r.citedByCount,
      doi: r.doi,
      hasPdf: hasPdf(r),
      tier: r.classification === "CORE" ? ("key" as const) : ("supporting" as const),
    }))
    // A stable, supervisor-friendly order: most-cited first inside each bucket.
    .sort((a, b) => (b.citations ?? 0) - (a.citations ?? 0) || a.title.localeCompare(b.title));

  const bucket = (tier: "key" | "supporting", withPdf: boolean) =>
    refs.filter((r) => r.tier === tier && r.hasPdf === withPdf);

  const key = { withPdf: bucket("key", true), paywalled: bucket("key", false) };
  const supporting = { withPdf: bucket("supporting", true), paywalled: bucket("supporting", false) };

  return {
    projectCode: job.project.projectId,
    projectTitle: job.project.projectTitle,
    universityName: job.project.client.university?.name ?? null,
    department: job.project.client.department ?? null,
    supervisorName: job.project.supervisorName ?? null,
    preparedAt: job.createdAt.toISOString(),
    totals: {
      total: refs.length,
      key: key.withPdf.length + key.paywalled.length,
      supporting: supporting.withPdf.length + supporting.paywalled.length,
      withPdf: refs.filter((r) => r.hasPdf).length,
      paywalled: refs.filter((r) => !r.hasPdf).length,
    },
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
