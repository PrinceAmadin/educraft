import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { semesterDecisionSchema } from "@/lib/validations/finance-draws";
import { decideSemesterBonus, DrawError } from "@/lib/services/finance/founder-draws";
import { currentMonthKey } from "@/lib/services/finance/surplus";

/** The founder approves (distributes) or declines the CFO's semester bonus recommendation. Founder only. */
export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = semesterDecisionSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());
  try {
    const result = await decideSemesterBonus({ month: parsed.data.month || currentMonthKey(), decision: parsed.data.decision, note: parsed.data.note || undefined, approvedById: guard.session.userId });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DrawError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("POST /api/admin/finance/founder-draws/semester-bonus", error);
  }
}
