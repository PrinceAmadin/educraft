import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminRoles, serverError } from "@/lib/api";
import { MAX_UPLOAD_CHARS } from "@/lib/data-fetchers/uploaded-dataset";
import { resolveGenerationProject } from "@/lib/generation/generate-chapter";
import { projectNotFound, secondaryDataErrorBody } from "@/lib/generation/route-helpers";
import { MAX_UPLOAD_SOURCE, secondaryDataResponse, SecondaryDataError, uploadSecondaryData } from "@/lib/services/secondary-data";

export const dynamic = "force-dynamic";
// Chapter 3 may be read once more (one Claude call) before the file is checked.
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

const bodySchema = z.object({
  csv: z.string().max(MAX_UPLOAD_CHARS + 1),
  source: z.string().max(MAX_UPLOAD_SOURCE * 2),
});

/**
 * POST {csv, source}: the founder or the COO supplies a Mode 5 project's
 * dataset by hand (the variables no automatic source publishes). Replaces the
 * fetched dataset until Chapter 4 starts; 400 with `problems` when the file
 * does not fit the model Chapter 3 specifies.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdminRoles(["COO"]);
  if (!guard.ok) return guard.response;
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Send the CSV text and where the data comes from." }, { status: 400, headers: NO_STORE });
    const project = await resolveGenerationProject(params.id);
    if (!project) return projectNotFound();
    const result = await uploadSecondaryData(project.id, { userId: guard.session.userId, role: "ADMIN" }, parsed.data);
    return NextResponse.json(secondaryDataResponse(result.projectCode, result), { headers: NO_STORE });
  } catch (error) {
    if (error instanceof SecondaryDataError) return NextResponse.json(secondaryDataErrorBody(error), { status: error.status, headers: NO_STORE });
    return serverError("POST /api/admin/projects/[id]/generation/upload-secondary-data", error);
  }
}
