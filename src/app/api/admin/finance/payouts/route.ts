import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { markPayouts } from "@/lib/services/payouts";
import { TransitionError } from "@/lib/services/projects";
import { payoutActionSchema } from "@/lib/validations/ambassadors";

/** Records a transfer as paid. The founder and the CFO only: the COO sees the queue but never marks it. */
export async function POST(req: NextRequest) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = payoutActionSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const result = await markPayouts({
      kind: parsed.data.kind,
      scope: parsed.data.scope,
      id: parsed.data.id,
      reference: parsed.data.reference || undefined,
      date: parsed.data.date || undefined,
      confirmedById: guard.session.userId,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("POST /api/admin/finance/payouts", error);
  }
}
