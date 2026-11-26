import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import {
  RecruitCardError,
  listRecruitCards,
  mintRecruitCard,
  setRecruitCardStatus,
} from "@/lib/services/growth/recruit-cards";
import { RECRUIT_FUNNEL_TAG } from "@/lib/services/growth/recruit-funnel";

/**
 * Printed recruitment card designs. Founder and Head of Growth — the same
 * audience as the /admin/growth pages, through the `/api/admin/growth` row in
 * `API_PERMISSIONS`, with the guard here as the second layer.
 *
 * Nothing mints a card on its own: which designs get printed is a decision
 * about a print budget, not a side effect of approving somebody.
 */

export async function GET() {
  const guard = await requireAdminRoles(["HOG"]);
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json({ cards: await listRecruitCards() });
  } catch (error) {
    return serverError("GET /api/admin/growth/cards", error);
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminRoles(["HOG"]);
  if (!guard.ok) return guard.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Expected a JSON body");
  }

  const num = (value: unknown): number | null => {
    if (value === "" || value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  };

  try {
    if (body.action === "retire" || body.action === "activate") {
      const id = typeof body.id === "string" ? body.id : "";
      if (!id) return badRequest("Which card?");
      await setRecruitCardStatus(id, body.action === "retire" ? "RETIRED" : "ACTIVE");
      revalidateTag(RECRUIT_FUNNEL_TAG);
      return NextResponse.json({ ok: true });
    }

    const holderType = body.holderType === "AMBASSADOR" ? "AMBASSADOR" : "HOG";
    const holderId = typeof body.holderId === "string" ? body.holderId.trim() : "";
    const label = typeof body.label === "string" ? body.label : "";
    if (!holderId) return badRequest("Choose who the cards are for");

    const card = await mintRecruitCard(
      {
        holderType,
        holderId,
        label,
        batch: typeof body.batch === "string" ? body.batch : null,
        universityId: typeof body.universityId === "string" ? body.universityId : null,
        printedCount: num(body.printedCount),
        unitCostNgn: num(body.unitCostNgn),
      },
      guard.session.userId
    );
    revalidateTag(RECRUIT_FUNNEL_TAG);
    return NextResponse.json({ card }, { status: 201 });
  } catch (error) {
    if (error instanceof RecruitCardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return serverError("POST /api/admin/growth/cards", error);
  }
}
