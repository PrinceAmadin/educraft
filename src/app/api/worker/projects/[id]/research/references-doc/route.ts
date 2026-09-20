import { NextResponse } from "next/server";
import { requireWorker, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { ResearchError, getResearchJob } from "@/lib/services/research";
import { buildReferencesDocx } from "@/lib/research-references-doc";

/** Every kept reference as a Word document — alphabetical, de-duplicated, in the project's referencing style. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;

  try {
    const job = await getResearchJob(guard.workerId, params.id);
    const kept = job?.references.filter((r) => r.status === "KEPT") ?? [];
    if (!job || kept.length === 0) {
      return NextResponse.json({ error: "No references to export yet" }, { status: 404 });
    }

    const project = await db.project.findUnique({
      where: { id: job.projectId },
      select: { referencingStyle: true },
    });
    const file = await buildReferencesDocx(kept, project?.referencingStyle ?? null);

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${params.id}-references.docx"`,
      },
    });
  } catch (error) {
    if (error instanceof ResearchError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return serverError("GET /api/worker/projects/[id]/research/references-doc", error);
  }
}
