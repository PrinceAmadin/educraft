import { NextRequest, NextResponse } from "next/server";
import { getPendingIntakeStatus, resyncPaystackReference } from "@/lib/services/paystack-payments";

/**
 * Public — no auth. Polled by /intake/success after Paystack sends the client
 * back. If the project does not exist yet, Paystack is asked directly whether
 * that reference was paid and, if so, the project is created right here, so
 * the client never depends on a webhook arriving first. The webhook, when it
 * does arrive, finds the work already done (see the claim in creditPendingIntake).
 */
export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get("ref")?.trim();
  if (!reference) return NextResponse.json({ error: "Missing reference" }, { status: 400 });

  let result = await getPendingIntakeStatus(reference);
  if (result.state === "pending" && reference.startsWith("INTAKE-")) {
    try {
      await resyncPaystackReference(reference);
      result = await getPendingIntakeStatus(reference);
    } catch (error) {
      console.error("[GET /api/intake/status] verify failed", reference, error);
    }
  }
  return NextResponse.json(result);
}
