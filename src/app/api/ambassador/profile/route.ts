import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAmbassador, serverError } from "@/lib/api";
import { updateAmbassadorBank } from "@/lib/services/ambassador-portal";
import { ambassadorBankSchema } from "@/lib/validations/ambassador";

export async function PATCH(req: NextRequest) {
  const guard = await requireAmbassador();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = ambassadorBankSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const result = await updateAmbassadorBank(guard.ambassadorId, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return serverError("PATCH /api/ambassador/profile", error);
  }
}
