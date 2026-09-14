import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import {
  CommissionError,
  allocateAmbassador,
  removeAllocation,
} from "@/lib/services/ambassador-commission";
import { allocateAmbassadorSchema } from "@/lib/validations/commission";

/**
 * POST — allocate the job to an ambassador: sets their commission, logs it as
 * an expense, and (unless `notify: false`) emails them.
 * DELETE — take the ambassador off the job and drop its commission expense.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = allocateAmbassadorSchema.safeParse(body);
  if (!parsed.success) return badRequest("Pick an ambassador and a rate", parsed.error.flatten());

  try {
    const result = await allocateAmbassador({ project: params.id, ...parsed.data });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CommissionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("POST /api/admin/projects/[id]/ambassador", error);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    await removeAllocation(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof CommissionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("DELETE /api/admin/projects/[id]/ambassador", error);
  }
}
