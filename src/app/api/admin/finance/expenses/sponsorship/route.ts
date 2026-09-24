import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { sponsorshipExpenseSchema } from "@/lib/validations/expenses";
import { createSponsorshipExpense } from "@/lib/services/expenses";

/** The HOG logs a student-union sponsorship from the Growth Fund; over ₦50,000 it waits for the founder. Founder, CFO and HOG. */
export async function POST(req: NextRequest) {
  const guard = await requireAdminRoles(["CO_CEO_CFO", "HOG"]);
  if (!guard.ok) return guard.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = sponsorshipExpenseSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());
  try {
    const result = await createSponsorshipExpense(parsed.data, guard.session.userId, guard.session.role);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return serverError("POST /api/admin/finance/expenses/sponsorship", error);
  }
}
