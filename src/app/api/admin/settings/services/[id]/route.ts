import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { updateServiceSchema } from "@/lib/validations/settings";
import { updateService, ServiceCatalogError } from "@/lib/services/service-catalog";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = updateServiceSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    await updateService(params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ServiceCatalogError) {
      const status = error.message === "Service not found" ? 404 : 409;
      return NextResponse.json({ error: error.message }, { status });
    }
    return serverError("PATCH /api/admin/settings/services/[id]", error);
  }
}
