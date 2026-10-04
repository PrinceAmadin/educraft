import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { rateLimited } from "@/lib/rate-limit";
import { repriceSchema } from "@/lib/validations/reprice";
import { RepriceError, repriceProject } from "@/lib/services/finance/reprice";

/**
 * Change an already-paid project's service / option / price and re-apply the
 * money paid against the new price. Super admin only; a pricing decision.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const limited = await rateLimited(guard.session.userId, "reprice", 10, 60_000);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = repriceSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request");

  try {
    return NextResponse.json(await repriceProject(params.id, parsed.data, guard.session.userId));
  } catch (error) {
    if (error instanceof RepriceError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("POST /api/admin/projects/[id]/reprice", error);
  }
}
