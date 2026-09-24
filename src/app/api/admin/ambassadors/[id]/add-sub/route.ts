import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { addSubAmbassador, DirectoryError } from "@/lib/services/ambassador-platform/directory";
import { addSubSchema } from "@/lib/validations/ambassador-platform";

/** Put an existing solo ambassador under this Core (Silver+, max 10, one level deep). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = addSubSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    await addSubAmbassador(params.id, parsed.data.subId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DirectoryError) {
      return NextResponse.json({ error: error.message }, { status: error.message.includes("not found") ? 404 : 409 });
    }
    return serverError("POST /api/admin/ambassadors/[id]/add-sub", error);
  }
}
