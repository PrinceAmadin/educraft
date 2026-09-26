import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

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
