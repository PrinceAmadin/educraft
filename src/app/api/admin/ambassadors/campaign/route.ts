import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { CampaignError, getCampaign, saveCampaign, setMilestoneDone } from "@/lib/services/ambassador-platform/content";
import { campaignSchema, milestoneSchema } from "@/lib/validations/ambassador-platform";

async function body(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/** Set the next semester's start (the campaign runs 8 weeks before it). */
export async function PUT(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const parsed = campaignSchema.safeParse(await body(req));
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());
  try {
    await saveCampaign(parsed.data);
    return NextResponse.json(await getCampaign());
  } catch (error) {
    return serverError("PUT /api/admin/ambassadors/campaign", error);
  }
}

/** Mark a campaign milestone done (or not). */
export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const parsed = milestoneSchema.safeParse(await body(req));
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());
  try {
    await setMilestoneDone(parsed.data.key, parsed.data.done);
    return NextResponse.json(await getCampaign());
  } catch (error) {
    if (error instanceof CampaignError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("PATCH /api/admin/ambassadors/campaign", error);
  }
}
