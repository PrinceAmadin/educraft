import { NextRequest, NextResponse } from "next/server";
import { badRequest, serverError } from "@/lib/api";
import { PaystackPaymentError, initializePaystackPayment } from "@/lib/services/paystack-payments";
import { paystackInitializeBodySchema } from "@/lib/validations/payments";

/** Public — no auth. A client only ever pays their own project's own amount. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = paystackInitializeBodySchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const result = await initializePaystackPayment(parsed.data.projectId, parsed.data.leg);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PaystackPaymentError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("POST /api/payments/paystack/initialize", error);
  }
}
