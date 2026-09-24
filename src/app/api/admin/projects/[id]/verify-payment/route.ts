import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { TransitionError, verifyPayment } from "@/lib/services/projects";
import { verifyPaymentBodySchema } from "@/lib/validations/projects";

/** Verifying is a finance act: the founder and the CFO. The COO marks a payment as paid; finance confirms it. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
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
      paymentMethod: parsed.data.paymentMethod || undefined,
      reference: parsed.data.reference || undefined,
      paymentDate: parsed.data.date || undefined,
      notes: parsed.data.notes || undefined,
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
