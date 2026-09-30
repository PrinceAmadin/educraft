import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serverError } from "@/lib/api";
import { ensureReadback, readBackVersion } from "@/lib/services/chapter-readback";
import { opsGuard } from "@/lib/services/operations/route-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function versionOf(projectIdOrCode: string, versionId: string) {
  return db.deliverableVersion.findFirst({
    where: { id: versionId, deliverable: { kind: "CHAPTER", project: { OR: [{ id: projectIdOrCode }, { projectId: projectIdOrCode }] } } },
    select: { id: true },
  });
}

/**
 * GET: chapter review, what an uploaded chapter reads back as (the summary, the problems that stop
 * approval, what changes on the way, and the chapter text the report would be built from), for the
 * founder and the COO. POST reads the file again. 404 not a chapter version of this project.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string; versionId: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  try {
    const v = await versionOf(params.id, params.versionId);
    if (!v) return NextResponse.json({ error: "Version not found" }, { status: 404 });
    const { readback, text } = await ensureReadback(v.id);
    return NextResponse.json({ readback, text }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError("GET /api/admin/projects/[id]/deliverables/versions/[versionId]/readback", error);
  }
}

export async function POST(_req: NextRequest, { params }: { params: { id: string; versionId: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  try {
    const v = await versionOf(params.id, params.versionId);
    if (!v) return NextResponse.json({ error: "Version not found" }, { status: 404 });
    const { readback, text } = await readBackVersion(v.id);
    return NextResponse.json({ readback, text }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError("POST /api/admin/projects/[id]/deliverables/versions/[versionId]/readback", error);
  }
}
