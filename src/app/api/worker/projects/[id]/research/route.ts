import { NextResponse } from "next/server";
import { requireWorker, serverError } from "@/lib/api";
import { ResearchError, getResearchJob } from "@/lib/services/research";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireWorker();
  if (!guard.ok) return guard.response;

  try {
    const job = await getResearchJob(guard.workerId, params.id);
    const zoteroCollectionUrl =
      job?.zoteroCollectionKey && process.env.ZOTERO_GROUP_ID
        ? `https://www.zotero.org/groups/${process.env.ZOTERO_GROUP_ID}/collections/${job.zoteroCollectionKey}`
        : null;
    return NextResponse.json({ job, zoteroCollectionUrl });
  } catch (error) {
    if (error instanceof ResearchError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return serverError("GET /api/worker/projects/[id]/research", error);
  }
}
