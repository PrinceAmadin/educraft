import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { createPartnership, listPartnerships } from "@/lib/services/ambassador-platform/partnerships";
import { getHogBudget } from "@/lib/services/expenses";
import { currentMonthKey } from "@/lib/services/finance/surplus";
import { createPartnershipSchema } from "@/lib/validations/ambassador-platform";

/** Every partnership (renewals needing attention first) and the quarter's Growth Fund partnership budget. */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    const [partnerships, budget] = await Promise.all([listPartnerships(), getHogBudget(currentMonthKey())]);
    return NextResponse.json({ partnerships, budget });
  } catch (error) {
    return serverError("GET /api/admin/ambassadors/partnerships", error);
  }
}

/** "Add partnership". An active one with a commitment logs it as a Growth Fund sponsorship. */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = createPartnershipSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());
  try {
    const result = await createPartnership(parsed.data, { userId: guard.session.userId, role: guard.session.role });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return serverError("POST /api/admin/ambassadors/partnerships", error);
  }
}
