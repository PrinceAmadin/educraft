import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { validateStructure } from "@/lib/finance/cashflow-rules";
import { getActiveCashflowOrNull, level1KeysWithRecords, minServiceDownpayment } from "@/lib/services/cashflow";
import { cashflowStructureSchema, toStructure } from "@/lib/validations/cashflow";

/** A dry run of the publish rules on a structure, for the editor's server-side check before the confirmation. */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = cashflowStructureSchema.safeParse((body as { structure?: unknown })?.structure ?? body);
  if (!parsed.success) return badRequest("The structure has an invalid shape", parsed.error.flatten());
  try {
    const [active, keysWithRecords, minDown] = await Promise.all([getActiveCashflowOrNull(), level1KeysWithRecords(), minServiceDownpayment()]);
    const violations = validateStructure(toStructure(parsed.data), { previous: active?.structure ?? null, keysWithRecords, minServiceDownpayment: minDown });
    return NextResponse.json({ violations });
  } catch (error) {
    return serverError("POST /api/admin/cashflow/validate", error);
  }
}
