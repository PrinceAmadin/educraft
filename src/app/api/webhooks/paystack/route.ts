import { NextRequest, NextResponse } from "next/server";
import { handlePaystackWebhookEvent, verifyPaystackSignature } from "@/lib/services/paystack-payments";

/**
 * Paystack webhook — no session auth, verified instead by the signed body.
 * Always returns 200 once the signature checks out, even if event handling
 * hits an internal error, so Paystack doesn't hammer us with retries for
 * something a redelivery won't fix; unexpected errors are logged for us to
 * chase manually.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  if (!verifyPaystackSignature(rawBody, signature)) {
    console.error("[POST /api/webhooks/paystack] invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    await handlePaystackWebhookEvent(event as { event: string; data: { reference: string } });
  } catch (error) {
    console.error("[POST /api/webhooks/paystack]", error);
  }

  return NextResponse.json({ received: true });
}
