import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { AmbassadorHierarchyError, setAmbassadorParent } from "@/lib/services/ambassadors";
import { setParentSchema } from "@/lib/validations/commission";

/** Link (or, with `parentId: null`, unlink) an ambassador under a parent. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = setParentSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    await setAmbassadorParent(params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AmbassadorHierarchyError) {
      const status = error.message.includes("not found") ? 404 : 409;
      return NextResponse.json({ error: error.message }, { status });
    }
    return serverError("POST /api/admin/ambassadors/[id]/parent", error);
  }
}
