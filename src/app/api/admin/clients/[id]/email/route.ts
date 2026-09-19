import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { ClientEmailError, updateClientEmail } from "@/lib/services/clients";

const bodySchema = z.object({ email: z.string().trim().email("Enter a valid email").max(160) });

/** Sets the address the client's sign-in code is sent to. Admin/ops only. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
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
    return NextResponse.json(await updateClientEmail(params.id, parsed.data.email));
  } catch (error) {
    if (error instanceof ClientEmailError) return NextResponse.json({ error: error.message }, { status: 400 });
    return serverError("PATCH /api/admin/clients/[id]/email", error);
  }
}
