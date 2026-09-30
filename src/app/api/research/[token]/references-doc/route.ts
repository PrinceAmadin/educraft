import { NextResponse } from "next/server";
import { buildReferencesDocx } from "@/lib/research-references-doc";
import { loadSupervisorReferencesForDoc } from "@/lib/services/supervisor-package";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Every kept reference as a Word document, from the public supervisor page. */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const view = await loadSupervisorReferencesForDoc(params.token);
  if (!view || view.references.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const file = await buildReferencesDocx(view.references, view.referencingStyle);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${view.projectCode}-references.docx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
