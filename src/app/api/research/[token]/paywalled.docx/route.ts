import { NextResponse } from "next/server";
import { buildReferencesDocx } from "@/lib/research-references-doc";
import { hasPdf } from "@/lib/services/research-files";
import { loadSupervisorReferencesForDoc } from "@/lib/services/supervisor-package";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Only the paywalled references (no PDF on our side), as a Word document. */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const view = await loadSupervisorReferencesForDoc(params.token);
  if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const paywalled = view.references.filter((r) => !hasPdf(r));
  if (paywalled.length === 0) return NextResponse.json({ error: "No paywalled references." }, { status: 404 });
  const file = await buildReferencesDocx(paywalled, view.referencingStyle);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${view.projectCode}-paywalled-references.docx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
