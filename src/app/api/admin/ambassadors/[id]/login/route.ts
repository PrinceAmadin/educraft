import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { createLoginSchema } from "@/lib/validations/portal-access";
import { createAmbassadorLogin, PortalAccessError } from "@/lib/services/portal-access";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = createLoginSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    await createAmbassadorLogin(params.id, parsed.data);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof PortalAccessError) {
      const status = error.message === "Ambassador not found" ? 404 : 409;
      return NextResponse.json({ error: error.message }, { status });
    }
    return serverError("POST /api/admin/ambassadors/[id]/login", error);
  }
}
