import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, requireSuperAdmin, serverError } from "@/lib/api";
import { financeSettingsSchema } from "@/lib/validations/expenses";
import { getFinanceSettings, updateFinanceSettings } from "@/lib/services/finance/settings";

/** The finance numbers the founder can change without a deploy. Founder and CFO read; founder writes. */
export async function GET() {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json(await getFinanceSettings());
  } catch (error) {
    return serverError("GET /api/admin/finance/settings", error);
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = financeSettingsSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());
  try {
    await updateFinanceSettings(parsed.data);
    return NextResponse.json(await getFinanceSettings());
  } catch (error) {
    return serverError("PATCH /api/admin/finance/settings", error);
  }
}
