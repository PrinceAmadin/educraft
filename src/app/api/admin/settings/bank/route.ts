import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { bankDetailsSchema } from "@/lib/validations/team";
import { saveBankDetails, TeamError } from "@/lib/services/team";

/**
 * Save bank details. Every executive saves their own; only SUPER_ADMIN may
 * name another executive's `userId`. The role comes from the server session.
 */
export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = bankDetailsSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  const target = parsed.data.userId ?? guard.session.userId;
  if (target !== guard.session.userId && guard.session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    return NextResponse.json(await saveBankDetails(target, parsed.data));
  } catch (error) {
    if (error instanceof TeamError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("PATCH /api/admin/settings/bank", error);
  }
}
