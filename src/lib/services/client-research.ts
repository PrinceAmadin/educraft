import { db } from "@/lib/db";
import type { ClientScope } from "@/lib/api";
import { downloadName } from "@/lib/files/policy";
import { siteUrl } from "@/lib/site-url";
import { toWaNumber, waLink } from "@/lib/whatsapp";
import { recordUpdate } from "@/lib/services/client-updates";
import { clientProjectPath, notifyClient } from "@/lib/services/client-notify";
import { DeliverableError } from "@/lib/services/deliverables";

/**
 * Research papers in the client's dashboard, instead of a Drive link. Shared
 * by an admin once the research step has passed. Clients see a paper's title,
 * authors, year, journal and DOI only: never how it was classified or which
 * tools found it. A research re-run deletes the job, so it must be shared again.
 */

export interface ClientPaper {
  id: string;
  title: string;
  authors: string | null;
  year: number | null;
  journal: string | null;
  doi: string | null;
  /** A PDF we hold (in the project's Drive folder) that the client can download here. */
  downloadable: boolean;
}

export interface ClientResearchView {
  sharedAt: string;
  papers: ClientPaper[];
  downloadableCount: number;
}

const hasPdf = (driveFileId: string | null) => Boolean(driveFileId && driveFileId !== "SKIPPED");

function readCode(code: string): string {
  try {
    return decodeURIComponent(code).trim().toUpperCase();
  } catch {
    return code.trim().toUpperCase();
  }
}

/** The shared research for one of the client's projects (by its database id), or null. */
export async function getClientResearch(projectDbId: string): Promise<ClientResearchView | null> {
  const job = await db.researchJob.findUnique({
    where: { projectId: projectDbId },
    select: {
      status: true,
      releasedToClientAt: true,
      references: {
        where: { status: "KEPT" },
        select: { id: true, title: true, proposedTitle: true, authors: true, year: true, journal: true, doi: true, driveFileId: true },
      },
    },
  });
  if (!job || job.status !== "PASSED" || !job.releasedToClientAt) return null;
  const papers = job.references
    .map((r) => ({
      id: r.id,
      title: (r.title ?? r.proposedTitle).trim(),
      authors: r.authors,
      year: r.year,
      journal: r.journal,
      doi: r.doi,
      downloadable: hasPdf(r.driveFileId),
    }))
    .sort((a, b) => Number(b.downloadable) - Number(a.downloadable) || a.title.localeCompare(b.title));
  return {
    sharedAt: job.releasedToClientAt.toISOString(),
    papers,
    downloadableCount: papers.filter((p) => p.downloadable).length,
  };
}

/** One downloadable paper on one of the client's own projects, with shared research. */
export async function clientPaper(
  scope: ClientScope,
  code: string,
  referenceId: string
): Promise<{ driveFileId: string; downloadAs: string } | null> {
  const ref = await db.reference.findFirst({
    where: {
      id: referenceId,
      status: "KEPT",
      project: { projectId: readCode(code), clientId: { in: scope.clientIds } },
      researchJob: { status: "PASSED", releasedToClientAt: { not: null } },
    },
    select: { driveFileId: true, title: true, proposedTitle: true, authors: true, year: true },
  });
  if (!ref || !hasPdf(ref.driveFileId)) return null;
  const firstAuthor = (ref.authors ?? "").split(";")[0]?.split(",")[0]?.trim() ?? "";
  const title = (ref.title ?? ref.proposedTitle).trim().split(/\s+/).slice(0, 10).join(" ");
  return {
    driveFileId: ref.driveFileId!,
    downloadAs: downloadName([firstAuthor, ref.year ? String(ref.year) : "", title], "pdf"),
  };
}

/** The kept references of one of the client's projects with shared research, for the Word file. */
export async function clientReferenceList(scope: ClientScope, code: string) {
  const project = await db.project.findFirst({
    where: { projectId: readCode(code), clientId: { in: scope.clientIds } },
    select: {
      projectId: true,
      referencingStyle: true,
      researchJob: {
        select: {
          status: true,
          releasedToClientAt: true,
          references: {
            where: { status: "KEPT" },
            select: { title: true, proposedTitle: true, authors: true, year: true, journal: true, doi: true },
          },
        },
      },
    },
  });
  const job = project?.researchJob;
  if (!project || !job || job.status !== "PASSED" || !job.releasedToClientAt || job.references.length === 0) return null;
  return { projectCode: project.projectId, style: project.referencingStyle, references: job.references };
}

/** Admin: show (or stop showing) the research in the client's Documents tab. */
export async function shareResearch(input: {
  projectIdOrCode: string;
  shared: boolean;
  adminUserId: string;
}): Promise<{ shared: boolean; whatsappUrl: string | null }> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: input.projectIdOrCode }, { projectId: input.projectIdOrCode }] },
    select: {
      id: true,
      projectId: true,
      client: { select: { fullName: true, phone: true, clientId: true } },
      researchJob: {
        select: { id: true, status: true, releasedToClientAt: true, _count: { select: { references: { where: { status: "KEPT" } } } } },
      },
    },
  });
  if (!project) throw new DeliverableError("Project not found", 404);
  const job = project.researchJob;
  if (!job || job.status !== "PASSED") throw new DeliverableError("The research step hasn't finished for this project.", 409);

  if (!input.shared) {
    await db.researchJob.update({ where: { id: job.id }, data: { releasedToClientAt: null, releasedToClientById: null } });
    return { shared: false, whatsappUrl: null };
  }

  const claimed = await db.researchJob.updateMany({
    where: { id: job.id, releasedToClientAt: null },
    data: { releasedToClientAt: new Date(), releasedToClientById: input.adminUserId },
  });
  if (claimed.count === 1) {
    const n = job._count.references;
    await recordUpdate(db, {
      projectId: project.id,
      kind: "RESEARCH",
      title: "Your research papers are ready",
      body: `${n} ${n === 1 ? "paper" : "papers"} chosen for your topic, with a reference list. See the Documents tab.`,
      dedupeKey: `research:${job.id}`,
    });
    await notifyClient(project.id, {
      title: "Your research papers are ready",
      message: `${project.projectId}: ${n} papers for your topic are in Documents.`,
      type: "success",
      tab: "documents",
      email: {
        kind: "research",
        heading: "Your research papers are ready",
        lines: [
          `We've gathered ${n} papers closely tied to your topic. The free ones download straight from your dashboard, and there's a reference list you can show your supervisor.`,
        ],
        ctaLabel: "See your papers",
      },
    });
  }

  const wa = toWaNumber(project.client.phone);
  const first = project.client.fullName.trim().split(/\s+/)[0] ?? "";
  const whatsappUrl = wa
    ? waLink(
        wa,
        `Hi ${first}, the research papers for your project ${project.projectId} are ready on your EduCraft dashboard: ${siteUrl()}${clientProjectPath(project.projectId, "documents")}\nSign in with your Client ID ${project.client.clientId}.`
      )
    : null;
  return { shared: true, whatsappUrl };
}
