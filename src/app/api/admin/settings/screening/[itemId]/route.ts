import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { ScreeningError, deleteScreeningItem, updateScreeningItem } from "@/lib/services/screening";
import { updateScreeningItemSchema } from "@/lib/validations/screening";

/** Edit or delete one screening bank item. Founder only (see the bank route). */
export async function PATCH(req: NextRequest, { params }: { params: { itemId: string } }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = updateScreeningItemSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    await updateScreeningItem(params.itemId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ScreeningError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("screening-item-update", error);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { itemId: string } }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  try {
    await deleteScreeningItem(params.itemId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ScreeningError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("screening-item-delete", error);
  }
}
