import { NextResponse } from "next/server";
import { requireSuperAdmin, serverError } from "@/lib/api";
import { rateLimited } from "@/lib/rate-limit";
import { sendTestEmails } from "@/lib/services/finance/email-harness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Send the three sample cashflow emails to EMAIL_TEST_RECIPIENT (founder only). Item 5. */
export async function POST() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const limited = await rateLimited(guard.session.userId, "email-test", 5);
  if (limited) return limited;
  try {
    const result = await sendTestEmails(guard.session.userId);
    return NextResponse.json(result);
  } catch (error) {
    return serverError("POST /api/admin/finance/email-test", error);
  }
}
