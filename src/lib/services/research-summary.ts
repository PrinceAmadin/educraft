import { db } from "@/lib/db";
import { hasPdf } from "@/lib/services/research-files";

export interface ResearchSummary {
  total: number;
  core: number;
  closelyRelated: number;
  /** Kept papers with a downloadable PDF stored on our side. */
  withPdf: number;
  /** Kept papers with no PDF saved (paywalled, or the host blocked the download). */
  referenceOnly: number;
}

/** For the admin "client update" message — null until the research job has finished successfully. */
export async function getResearchSummary(projectDbId: string): Promise<ResearchSummary | null> {
  const job = await db.researchJob.findUnique({
    where: { projectId: projectDbId },
    select: {
      status: true,
      references: {
        where: { status: "KEPT" },
        select: { classification: true, pdfBlobPath: true, driveFileId: true },
      },
    },
  });
  if (!job || job.status !== "PASSED") return null;

  const total = job.references.length;
  const withPdf = job.references.filter(hasPdf).length;
  return {
    total,
    core: job.references.filter((r) => r.classification === "CORE").length,
    closelyRelated: job.references.filter((r) => r.classification === "CLOSELY_RELATED").length,
    withPdf,
    referenceOnly: total - withPdf,
  };
}
