import { NextResponse } from "next/server";
import { requireWorker, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { ResearchError, getResearchJob } from "@/lib/services/research";
import { buildReferencesDocx } from "@/lib/research-references-doc";
import { hasPdf } from "@/lib/services/research-files";

/**
 * The kept references we do NOT hold a PDF for — a Word file the client (or
 * their library) can chase from the DOI. Generated on demand from the DB, so
 * it is always current and never stored. Replaces the old Google Doc the
 * pipeline used to create in the project's Drive folder.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;

  try {
    const job = await getResearchJob(guard.workerId, params.id);
    const paywalled = job?.references.filter((r) => r.status === "KEPT" && !hasPdf(r)) ?? [];
    if (!job || paywalled.length === 0) {
      return NextResponse.json({ error: "No paywalled references to export" }, { status: 404 });
    }

    const project = await db.project.findUnique({
      where: { id: job.projectId },
      select: { referencingStyle: true },
    });
    const file = await buildReferencesDocx(paywalled, project?.referencingStyle ?? null);

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${params.id}-paywalled-references.docx"`,
      },
    });
  } catch (error) {
    if (error instanceof ResearchError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return serverError("GET /api/worker/projects/[id]/research/paywalled.docx", error);
  }
}
