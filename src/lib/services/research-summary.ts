import { db } from "@/lib/db";

export interface ResearchSummary {
  total: number;
  core: number;
  closelyRelated: number;
  /** Kept papers whose PDF is in the project's Drive folder. */
  withPdf: number;
  /** Kept papers with no PDF saved (paywalled, or the host blocked the download). */
  referenceOnly: number;
  driveFolderLink: string | null;
}

/** For the admin "client update" message — null until the research job has finished successfully. */
export async function getResearchSummary(projectDbId: string): Promise<ResearchSummary | null> {
  const job = await db.researchJob.findUnique({
    where: { projectId: projectDbId },
    select: {
      status: true,
      driveFolderLink: true,
      references: {
        where: { status: "KEPT" },
        select: { classification: true, driveFileId: true },
      },
    },
  });
  if (!job || job.status !== "PASSED") return null;

  const total = job.references.length;
  const withPdf = job.references.filter((r) => r.driveFileId && r.driveFileId !== "SKIPPED").length;
  return {
    total,
    core: job.references.filter((r) => r.classification === "CORE").length,
    closelyRelated: job.references.filter((r) => r.classification === "CLOSELY_RELATED").length,
    withPdf,
    referenceOnly: total - withPdf,
    driveFolderLink: job.driveFolderLink,
  };
}
