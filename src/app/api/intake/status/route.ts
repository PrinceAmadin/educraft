import { NextRequest, NextResponse } from "next/server";
import { getPendingIntakeStatus } from "@/lib/services/paystack-payments";

/** Public — no auth. Polled by /intake/success while the webhook catches up with the Paystack redirect. */
export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get("ref")?.trim();
  if (!reference) return NextResponse.json({ error: "Missing reference" }, { status: 400 });

  const result = await getPendingIntakeStatus(reference);
  return NextResponse.json(result);
}
