import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { ProBonoError, markProjectProBono } from "@/lib/services/probono";

const bodySchema = z.object({
  reason: z.string().trim().min(3, "Say why this job is pro bono").max(300),
});

/** Marks an existing project pro bono. One-way: it wipes the price. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request");

  try {
    return NextResponse.json(await markProjectProBono(params.id, parsed.data.reason, guard.session.userId));
  } catch (error) {
    if (error instanceof ProBonoError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("POST /api/admin/projects/[id]/probono", error);
  }
}
