import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { createServiceSchema } from "@/lib/validations/settings";
import { createService, ServiceCatalogError } from "@/lib/services/service-catalog";

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = createServiceSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    const service = await createService(parsed.data);
    return NextResponse.json(service, { status: 201 });
  } catch (error) {
    if (error instanceof ServiceCatalogError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("POST /api/admin/settings/services", error);
  }
}
