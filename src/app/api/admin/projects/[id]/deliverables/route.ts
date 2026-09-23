import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin } from "@/lib/api";
import { fileActionError } from "@/lib/files/route-errors";
import { addDeliverable } from "@/lib/services/deliverables";
import { addDeliverableSchema } from "@/lib/validations/deliverables";

export const dynamic = "force-dynamic";

/** POST { title, access }: add a document to the project's list (e.g. "Questionnaire"). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = addDeliverableSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Give the document a name.");

  try {
    const created = await addDeliverable({
      projectIdOrCode: params.id,
      title: parsed.data.title,
      access: parsed.data.access,
      actor: { userId: guard.session.userId, role: guard.session.role },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return fileActionError("POST /api/admin/projects/[id]/deliverables", error);
  }
}
