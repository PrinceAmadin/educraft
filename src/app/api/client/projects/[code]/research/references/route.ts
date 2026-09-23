import { NextRequest, NextResponse } from "next/server";
import { requireClient, serverError } from "@/lib/api";
import { contentDisposition } from "@/lib/files/policy";
import { buildReferencesDocx } from "@/lib/research-references-doc";
import { clientReferenceList } from "@/lib/services/client-research";

export const dynamic = "force-dynamic";

/** GET: the project's reference list as a Word file, once EduCraft has shared the research. */
export async function GET(_req: NextRequest, { params }: { params: { code: string } }) {
  const guard = await requireClient();
  if (!guard.ok) return guard.response;

  try {
    const list = await clientReferenceList(guard.scope, params.code);
    if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const file = await buildReferencesDocx(list.references, list.style);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": contentDisposition(`${list.projectCode} References.docx`),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return serverError("GET /api/client/projects/[code]/research/references", error);
  }
}
