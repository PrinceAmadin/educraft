import { NextRequest, NextResponse } from "next/server";
import { requireClient, serverError } from "@/lib/api";
import { getInvoiceData } from "@/lib/services/client-portal";
import { buildReceiptPdf } from "@/lib/receipts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * D10: a PDF invoice for one pending payment on the client's own project.
 *
 * Same one-page template as the receipt with an "INVOICE" title, PENDING
 * watermark and "Due now" instead of "Paid to date". Uses the payment row's
 * paymentId (EC-PAY-XXXXX) as the invoice number, so no separate invoice
 * model is needed — one row per pending leg.
 */
export async function GET(_req: NextRequest, { params }: { params: { code: string; paymentId: string } }) {
  const guard = await requireClient();
  if (!guard.ok) return guard.response;
  try {
    const invoice = await getInvoiceData(guard.scope, params.code, params.paymentId);
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    const pdf = buildReceiptPdf(invoice, { variant: "invoice" });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="EduCraft invoice ${invoice.receiptNo}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return serverError("GET /api/client/projects/[code]/payments/[paymentId]/invoice", error);
  }
}
