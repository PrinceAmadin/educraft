import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { createAmbassador } from "@/lib/services/ambassadors";
import { createAmbassadorSchema } from "@/lib/validations/ambassadors";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = createAmbassadorSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    const ambassador = await createAmbassador(parsed.data);
    return NextResponse.json(ambassador, { status: 201 });
  } catch (error) {
    return serverError("POST /api/admin/ambassadors", error);
  }
}
