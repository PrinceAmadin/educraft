import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { ProBonoError, createInvite } from "@/lib/services/probono";

const bodySchema = z.object({
  serviceCode: z.string().min(1, "Choose a service"),
  recipient: z.string().trim().min(2, "Who is this link for?").max(120),
  reason: z.string().trim().max(300).optional().or(z.literal("")),
});

/** Creates a one-time pro bono intake link. */
export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    const invite = await createInvite(parsed.data, guard.session.userId);
    return NextResponse.json(invite, { status: 201 });
  } catch (error) {
    if (error instanceof ProBonoError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("POST /api/admin/probono", error);
  }
}
