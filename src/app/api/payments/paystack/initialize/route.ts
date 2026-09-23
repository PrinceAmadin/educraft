import { NextRequest, NextResponse } from "next/server";
import { badRequest, serverError } from "@/lib/api";
import { PaystackPaymentError, initializePaystackPayment } from "@/lib/services/paystack-payments";
import { paystackInitializeBodySchema } from "@/lib/validations/payments";

/**
 * Public, no sign-in: the DOWNPAYMENT only (the intake success page, before the
 * client has a login). The balance is paid from the signed-in dashboard
 * (POST /api/client/projects/[code]/pay), so a stranger holding a project code
 * cannot start or supersede balance checkouts on someone else's project.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = paystackInitializeBodySchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  if (parsed.data.leg !== "downpayment") {
    return NextResponse.json({ error: "Sign in to your dashboard to pay your balance." }, { status: 403 });
  }

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
