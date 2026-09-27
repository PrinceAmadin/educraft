import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/api";
import { parseBody } from "@/lib/services/operations/route-helpers";
import { findClientProject } from "@/lib/services/client-portal";
import { submitClientData } from "@/lib/services/data-pause";
import { getClientPauseView } from "@/lib/services/client-data-pause";
import { dataPauseErrorResponse } from "@/lib/services/data-pause-errors";
import { clientDataUploadSchema } from "@/lib/validations/data-pause";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Reads each Word/Excel/CSV file back once to turn it into text for the chapters.
export const maxDuration = 120;

/** GET: the data request on the client's own project, or { pause: null }. */
export async function GET(_req: NextRequest, { params }: { params: { code: string } }) {
  const guard = await requireClient();
  if (!guard.ok) return guard.response;
  const project = await findClientProject(guard.scope, params.code);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  try {
    return NextResponse.json({ pause: await getClientPauseView(project.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return dataPauseErrorResponse("GET /api/client/projects/[code]/data-upload", error);
  }
}

/**
 * POST { pauseId, files: [{ pathname, ticket, fileName }], answers }: the client sends
 * the data files their report is waiting for. The files are already in the private
 * store (uploaded straight from the browser with tickets from .../upload, because a
 * function takes at most 4.5 MB); this registers them: 1 to 10 files, 25 MB each,
 * PDF, Word, Excel, CSV, JPG or PNG. 404 for another client's project, 403 when the
 * project is not waiting for their files, 400 for a bad or oversized file.
 */
export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const guard = await requireClient();
  if (!guard.ok) return guard.response;
  const project = await findClientProject(guard.scope, params.code);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const body = await parseBody(req, clientDataUploadSchema);
  if (!body.ok) return body.response;
  try {
    const result = await submitClientData(project, guard.scope.userId, body.data);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return dataPauseErrorResponse("POST /api/client/projects/[code]/data-upload", error);
  }
}
