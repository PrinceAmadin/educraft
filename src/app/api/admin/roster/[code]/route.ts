import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { RosterError, updateSlot, vacateSlot } from "@/lib/services/ambassador-roster";
import { updateSlotSchema } from "@/lib/validations/roster";

type Ctx = { params: { code: string } };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = updateSlotSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    await updateSlot(decodeURIComponent(params.code), parsed.data);
    revalidatePath("/admin/ambassadors", "layout");
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RosterError) return badRequest(error.message);
    return serverError("PATCH /api/admin/roster/[code]", error);
  }
}

/** "Reset": empties the slot. It does not delete the row. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const result = await vacateSlot(decodeURIComponent(params.code));
    revalidatePath("/admin/ambassadors", "layout");
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RosterError) return badRequest(error.message);
    return serverError("DELETE /api/admin/roster/[code]", error);
  }
}
