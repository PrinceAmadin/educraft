import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { expectedDeliverySchema } from "@/lib/validations/client-portal";

export const dynamic = "force-dynamic";

/**
 * PATCH { date: "YYYY-MM-DD" | null }: the delivery date the CLIENT sees. The
 * internal deadline is separate and never shown to them. Saved as the end of
 * that day in Lagos.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = expectedDeliverySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid date");

  try {
    const date = parsed.data.date ? new Date(`${parsed.data.date}T23:59:00+01:00`) : null;
    const changed = await db.project.updateMany({
      where: { OR: [{ id: params.id }, { projectId: params.id }] },
      data: { expectedDeliveryAt: date },
    });
    if (changed.count === 0) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("PATCH /api/admin/projects/[id]/expected-delivery", error);
  }
}
