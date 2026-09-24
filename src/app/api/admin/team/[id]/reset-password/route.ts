import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, serverError } from "@/lib/api";
import { resetExecutivePassword, TeamError } from "@/lib/services/team";

/** Sets a fresh one-time password and returns it once, for the founder to pass on. Founder only. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  try {
    return NextResponse.json(await resetExecutivePassword(params.id));
  } catch (error) {
    if (error instanceof TeamError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("POST /api/admin/team/[id]/reset-password", error);
  }
}
