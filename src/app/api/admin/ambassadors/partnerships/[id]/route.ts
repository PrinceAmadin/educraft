import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { getPartnership, PartnershipError, updatePartnership } from "@/lib/services/ambassador-platform/partnerships";
import { updatePartnershipSchema } from "@/lib/validations/ambassador-platform";

/** The partnership's detail: contact, terms, Growth Fund payments, the ambassadors and projects it brought. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    const detail = await getPartnership(params.id);
    if (!detail) return NextResponse.json({ error: "Partnership not found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (error) {
    return serverError("GET /api/admin/ambassadors/partnerships/[id]", error);
  }
}

/** Edit any field or the status. Becoming active for the first time logs the commitment once. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = updatePartnershipSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());
  try {
    return NextResponse.json(await updatePartnership(params.id, parsed.data, { userId: guard.session.userId, role: guard.session.role }));
  } catch (error) {
    if (error instanceof PartnershipError) return NextResponse.json({ error: error.message }, { status: error.message.includes("not found") ? 404 : 409 });
    return serverError("PATCH /api/admin/ambassadors/partnerships/[id]", error);
  }
}
