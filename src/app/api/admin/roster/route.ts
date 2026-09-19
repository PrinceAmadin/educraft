import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { RosterError, addSlot } from "@/lib/services/ambassador-roster";
import { addSlotSchema } from "@/lib/validations/roster";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = addSlotSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    const result = await addSlot(parsed.data);
    revalidatePath("/admin/ambassadors", "layout");
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof RosterError) return badRequest(error.message);
    return serverError("POST /api/admin/roster", error);
  }
}
