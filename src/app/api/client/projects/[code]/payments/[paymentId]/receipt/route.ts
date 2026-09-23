import { NextRequest, NextResponse } from "next/server";
import { requireClient, serverError } from "@/lib/api";
import { getReceiptData } from "@/lib/services/client-portal";
import { buildReceiptPdf } from "@/lib/receipts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET: a PDF receipt for one confirmed payment on the client's own project. */
export async function GET(_req: NextRequest, { params }: { params: { code: string; paymentId: string } }) {
  const guard = await requireClient();
  if (!guard.ok) return guard.response;
  try {
    const receipt = await getReceiptData(guard.scope, params.code, params.paymentId);
    if (!receipt) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    const pdf = buildReceiptPdf(receipt);
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
