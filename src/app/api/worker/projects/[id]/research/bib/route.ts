import { NextResponse } from "next/server";
import { requireWorker, serverError } from "@/lib/api";
import { ResearchError, getResearchJob } from "@/lib/services/research";
import { buildBibtex } from "@/lib/research-bib";

/** The project's kept references as a .bib file — importable into Zotero, Mendeley, Word or LaTeX. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;

  try {
    const job = await getResearchJob(guard.workerId, params.id);
    const kept = job?.references.filter((r) => r.status === "KEPT") ?? [];
    if (!job || kept.length === 0) {
      return NextResponse.json({ error: "No references to export yet" }, { status: 404 });
    }

    return new NextResponse(buildBibtex(kept), {
      headers: {
        "Content-Type": "application/x-bibtex; charset=utf-8",
        "Content-Disposition": `attachment; filename="${params.id}-references.bib"`,
      },
    });
  } catch (error) {
    if (error instanceof ResearchError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return serverError("GET /api/worker/projects/[id]/research/bib", error);
  }
}
