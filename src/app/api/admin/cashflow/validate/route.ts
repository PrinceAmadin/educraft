import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { rateLimited } from "@/lib/rate-limit";
import { validateStructure } from "@/lib/finance/cashflow-rules";
import { getActiveCashflowOrNull, level1KeysWithRecords, minServiceDownpayment } from "@/lib/services/cashflow";
import { cashflowStructureSchema, toStructure } from "@/lib/validations/cashflow";

/** A dry run of the publish rules on a structure, for the editor's server-side check before the confirmation. */
export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const limited = await rateLimited(guard.session.userId, "cashflow-settings", 10);
  if (limited) return limited;
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
