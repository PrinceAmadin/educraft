import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { PaystackResyncError, resyncPaystackReference } from "@/lib/services/paystack-payments";
import { paystackResyncBodySchema } from "@/lib/validations/payments";

const MESSAGE: Record<string, string> = {
  confirmed: "Synced — the payment is now confirmed.",
  already_confirmed: "Already confirmed — nothing to do.",
  not_successful: "Paystack does not show this transaction as successful.",
  no_local_record: "No matching Payment record found for this reference.",
  missing_metadata: "Paystack has no project/leg metadata for this transaction.",
};

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = paystackResyncBodySchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const result = await resyncPaystackReference(parsed.data.reference);
    const ok = result.status === "confirmed" || result.status === "already_confirmed";
    return NextResponse.json(
      { status: result.status, message: MESSAGE[result.status] },
      { status: ok ? 200 : 409 }
    );
  } catch (error) {
    if (error instanceof PaystackResyncError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return serverError("POST /api/admin/finance/paystack-reconciliation/sync", error);
  }
}
