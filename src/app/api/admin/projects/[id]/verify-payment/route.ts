import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { TransitionError, verifyPayment } from "@/lib/services/projects";
import { verifyPaymentBodySchema } from "@/lib/validations/projects";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = verifyPaymentBodySchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const project = await verifyPayment(params.id, {
      leg: parsed.data.leg,
      reference: parsed.data.reference,
      changedById: guard.session.userId,
    });
    return NextResponse.json({ status: project.status });
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("POST /api/admin/projects/[id]/verify-payment", error);
  }
}
