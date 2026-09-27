import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sqlTable } from "@/lib/db-schema";
import { resolveTemplate } from "@/lib/intake-templates";

/**
 * The one definition of "generation has started" for a project: a chapter run
 * (GenerationCheckpoint) exists. From then on the research mode can no longer
 * change (D3) and research can no longer be re-run, because a re-run deletes the
 * references the chapters were written from (B7).
 */
export async function hasGenerationStarted(projectDbId: string, client: Prisma.TransactionClient | typeof db = db): Promise<boolean> {
  return (await client.generationCheckpoint.count({ where: { projectId: projectDbId } })) > 0;
}

export const RESEARCH_LOCKED_MESSAGE =
  "Chapters have been generated from this research, so it can no longer be re-run: a re-run would delete the references they cite.";

/**
 * Serialises, for one project, every write to the mode card and its brief
 * (mode, objectives, sources) and the start of a chapter: each takes this row
 * lock first, so an edit, an approval, a reopen and a generation start can
 * never interleave.
 */
export async function lockProjectRow(tx: Prisma.TransactionClient, projectDbId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM ${sqlTable("Project")} WHERE id = ${projectDbId} FOR UPDATE`;
}

/** Written final-year reports and theses: every academic_fyp* service uses the final-year form. */
export function isReportTemplate(template: string | null | undefined): boolean {
  return Boolean(template) && resolveTemplate(template!) === "academic_fyp";
}
