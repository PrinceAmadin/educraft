import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoles, serverError } from "@/lib/api";
import { rateLimited } from "@/lib/rate-limit";
import { batchBankRows } from "@/lib/services/finance/payout-batches";
import { buildBatchBankXlsx, batchXlsxFilename } from "@/lib/finance/payout-xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Download a payout batch's per-recipient bank list as .xlsx for a bulk transfer (founder + CFO). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;
  const limited = await rateLimited(guard.session.userId, "payout-batch", 5);
  if (limited) return limited;
  try {
    const data = await batchBankRows(params.id);
    if (!data) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    const buf = await buildBatchBankXlsx(data);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${batchXlsxFilename(data)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return serverError("GET /api/admin/finance/payouts/batches/[id]/export", error);
  }
}
