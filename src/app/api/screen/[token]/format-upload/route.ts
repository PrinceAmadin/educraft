import { NextRequest, NextResponse } from "next/server";
import { serverError } from "@/lib/api";
import { ScreeningError, gradeFormatUpload } from "@/lib/services/screening";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Receives a candidate's fixed formatting document, grades it in memory and
 * records the result. The token is the credential; the file is validated as a
 * .docx (a ZIP) and size-capped. It can be re-uploaded until the test is
 * submitted. The file itself is not kept — only the grade.
 */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Attach a Word document (.docx)." }, { status: 400 });
    if (file.size === 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "The file must be a Word document under 5 MB." }, { status: 400 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    // A .docx is a ZIP: it starts with "PK\x03\x04".
    const isZip = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
    const named = file.name.toLowerCase().endsWith(".docx") || file.type === DOCX_TYPE;
    if (!isZip || !named) return NextResponse.json({ error: "That is not a Word document (.docx)." }, { status: 400 });

    const result = await gradeFormatUpload(params.token, bytes);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ScreeningError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("screening-format-upload", error);
  }
}
