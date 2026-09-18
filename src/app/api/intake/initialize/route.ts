import { NextRequest, NextResponse } from "next/server";
import { intakeSubmitSchema } from "@/lib/validations/intake";
import { PaystackPaymentError, initializeIntakePayment } from "@/lib/services/paystack-payments";

/**
 * Public — no auth. Starts payment for a validated-but-unsubmitted intake
 * form; the Client/Project is only created once the webhook confirms the
 * downpayment (see /api/webhooks/paystack + creditPendingIntake).
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const parsed = intakeSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the form", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await initializeIntakePayment(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof PaystackPaymentError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("[POST /api/intake/initialize]", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
