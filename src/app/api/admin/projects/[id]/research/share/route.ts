import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin } from "@/lib/api";
import { fileActionError } from "@/lib/files/route-errors";
import { shareResearch } from "@/lib/services/client-research";
import { shareResearchSchema } from "@/lib/validations/deliverables";

export const dynamic = "force-dynamic";

/** POST { shared }: show the finished research in the client's Documents tab, or stop showing it. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = shareResearchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid request");

  try {
    return NextResponse.json(
      await shareResearch({ projectIdOrCode: params.id, shared: parsed.data.shared, adminUserId: guard.session.userId })
    );
  } catch (error) {
    return fileActionError("POST /api/admin/projects/[id]/research/share", error);
  }
}
