import { NextRequest, NextResponse } from "next/server";
import { requireClient, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { readStoredReceipt } from "@/lib/services/billing";
import { getReceiptData } from "@/lib/services/client-portal";
import { buildReceiptPdf } from "@/lib/receipts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET: a PDF receipt for one confirmed payment on the client's own project.
 *
 * D10: if the payment has a stored PDF (written on Verify), serve it as is.
 * Falls back to the on-demand render for payments verified before D10 and for
 * cases where the Blob read fails (never blocks the client's download).
 */
export async function GET(_req: NextRequest, { params }: { params: { code: string; paymentId: string } }) {
  const guard = await requireClient();
  if (!guard.ok) return guard.response;
  try {
    const receipt = await getReceiptData(guard.scope, params.code, params.paymentId);
    if (!receipt) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    const stored = await db.payment
      .findUnique({ where: { id: params.paymentId }, select: { receiptBlobPath: true } })
      .then((p) => (p?.receiptBlobPath ? readStoredReceipt(p.receiptBlobPath) : null));
    const pdf = stored ?? buildReceiptPdf(receipt);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="EduCraft receipt ${receipt.receiptNo}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return serverError("GET /api/client/projects/[code]/payments/[paymentId]/receipt", error);
  }
}
