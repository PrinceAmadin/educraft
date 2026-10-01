import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { rateLimited } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { FinanceFileError, putFinanceFile } from "@/lib/services/finance/finance-files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Attach a bank-transfer confirmation to a payout batch (founder + CFO). A small
 * PDF or image, read from the request (a function body is capped at ~4.5 MB,
 * ample for a receipt), stored under the finance root as a FinanceFile. Returns
 * its id for the clear request.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;
  const limited = await rateLimited(guard.session.userId, "payout-batch", 5);
  if (limited) return limited;

  const batch = await db.payoutBatch.findUnique({ where: { id: params.id }, select: { id: true, status: true } });
  if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  if (batch.status !== "READY") return NextResponse.json({ error: "This batch has already been cleared." }, { status: 409 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return badRequest("Expected a file upload");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return badRequest("Attach a file");

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const saved = await putFinanceFile({ purpose: "bank_confirmation", targetId: batch.id, fileName: file.name, bytes, uploadedById: guard.session.userId });
    return NextResponse.json({ fileId: saved.id, fileName: saved.fileName });
  } catch (error) {
    if (error instanceof FinanceFileError) return NextResponse.json({ error: error.message }, { status: 400 });
    return serverError("POST /api/admin/finance/payouts/batches/[id]/bank-confirmation", error);
  }
}
